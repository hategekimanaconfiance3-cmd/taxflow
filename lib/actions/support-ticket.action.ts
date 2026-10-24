"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import db from "@/db/drizzle";
import {
  auditLog,
  notification,
  supportTicket,
  supportTicketEvent,
  supportTicketMessage,
  user,
} from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireTraderSession } from "@/lib/auth-guard";
import { emitToUser } from "@/lib/realtime";
import { getAuthorizedSupportStaff } from "@/lib/support/support-staff";
import { canTransitionSupportTicket, isSupportTicketStatus } from "@/lib/support/ticket-workflow";
import { ticketCreateSchema, ticketIdSchema, ticketMessageSchema, traderTicketConfirmationSchema } from "@/lib/validation/support-ticket";

type SupportTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
class SafeTicketError extends Error {}

async function recordTraderEvent(
  tx: SupportTx,
  input: {
    ticketId: string;
    actorUserId: string;
    eventType: string;
    previousStatus?: string | null;
    newStatus?: string | null;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert(supportTicketEvent).values({
    ticketId: input.ticketId,
    actorUserId: input.actorUserId,
    eventType: input.eventType,
    previousStatus: input.previousStatus ?? null,
    newStatus: input.newStatus ?? null,
    details: input.details,
  });
  await logAudit({
    userId: input.actorUserId,
    action: input.eventType.toUpperCase(),
    targetType: "support_ticket",
    targetId: input.ticketId,
    metadata: input.details,
    beforeState: input.previousStatus ? { status: input.previousStatus } : undefined,
    afterState: input.newStatus ? { status: input.newStatus } : undefined,
  }, async (entry) => {
    await tx.insert(auditLog).values(entry);
  });
}

async function storeTraderNotices(tx: SupportTx, userIds: string[], title: string, message: string, link: string) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  for (const userId of uniqueIds) {
    await tx.insert(notification).values({ userId, type: "ticket_update", title, message, link });
  }
  return uniqueIds;
}

function publishNotices(userIds: string[], title: string, message: string, link: string): void {
  for (const userId of userIds) {
    emitToUser(userId, "notification", { type: "ticket_update", title, message, link });
  }
}

function safeServerFailure(action: string, error: unknown): never {
  if (error instanceof SafeTicketError) throw new Error(error.message);
  console.error("Trader support ticket action failed", {
    action,
    errorName: error instanceof Error ? error.name : "UnknownError",
    errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Unknown failure",
  });
  throw new Error("Unable to update ticket. Something went wrong while processing this action. Please try again.");
}

/** Create a ticket and its audit history atomically. */
export async function createTicket(input: {
  category: "general" | "tax_query" | "account_issue" | "system_bug" | "other";
  subject: string;
  description: string;
}): Promise<{ success: true; id: string; ticketReference: string }> {
  const session = await requireTraderSession();
  const parsed = ticketCreateSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Enter a subject and description.");
  const reference = "TKT-" + crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  const supportStaff = await getAuthorizedSupportStaff();

  try {
    const created = await db.transaction(async (tx) => {
      const [ticket] = await tx.insert(supportTicket).values({
        traderId: session.user.id,
        ticketReference: reference,
        category: parsed.data.category,
        subject: parsed.data.subject,
        description: parsed.data.description,
      }).returning({ id: supportTicket.id, ticketReference: supportTicket.ticketReference });
      if (!ticket) throw new Error("Ticket insert returned no row.");
      await recordTraderEvent(tx, {
        ticketId: ticket.id,
        actorUserId: session.user.id,
        eventType: "ticket_created",
        newStatus: "open",
        details: { category: parsed.data.category },
      });
      const recipients = supportStaff.map((employee) => employee.userId);
      for (const userId of recipients) {
        await tx.insert(notification).values({
          userId,
          type: "ticket_update",
          title: "New support ticket",
          message: reference + " needs review.",
          link: "/admin/support/" + ticket.id,
        });
      }
      return { ticket, recipients };
    });
    publishNotices(created.recipients, "New support ticket", reference + " needs review.", "/admin/support/" + created.ticket.id);
    return { success: true, id: created.ticket.id, ticketReference: created.ticket.ticketReference };
  } catch (error) {
    return safeServerFailure("create", error);
  }
}

/** Traders can see only their own tickets and public fields. */
export async function getMyTickets() {
  const session = await requireTraderSession();
  return db.select({
    id: supportTicket.id,
    ticketReference: supportTicket.ticketReference,
    category: supportTicket.category,
    subject: supportTicket.subject,
    status: supportTicket.status,
    priority: supportTicket.priority,
    resolution: supportTicket.resolution,
    resolutionCategory: supportTicket.resolutionCategory,
    createdAt: supportTicket.createdAt,
    updatedAt: supportTicket.updatedAt,
    resolvedAt: supportTicket.resolvedAt,
    closedAt: supportTicket.closedAt,
  }).from(supportTicket)
    .where(eq(supportTicket.traderId, session.user.id))
    .orderBy(desc(supportTicket.updatedAt));
}

/** Return only this trader's ticket and public conversation; no internal notes/events. */
export async function getMySupportTicket(ticketIdInput: string) {
  const session = await requireTraderSession();
  const parsed = ticketIdSchema.safeParse(ticketIdInput);
  if (!parsed.success) return null;
  const assignedUser = user;
  const [ticket] = await db.select({
    id: supportTicket.id,
    ticketReference: supportTicket.ticketReference,
    traderId: supportTicket.traderId,
    category: supportTicket.category,
    subject: supportTicket.subject,
    description: supportTicket.description,
    status: supportTicket.status,
    priority: supportTicket.priority,
    resolution: supportTicket.resolution,
    resolutionCategory: supportTicket.resolutionCategory,
    createdAt: supportTicket.createdAt,
    updatedAt: supportTicket.updatedAt,
    resolvedAt: supportTicket.resolvedAt,
    closedAt: supportTicket.closedAt,
    assignedOfficerName: assignedUser.name,
  }).from(supportTicket)
    .leftJoin(assignedUser, eq(supportTicket.assignedToId, assignedUser.id))
    .where(and(eq(supportTicket.id, parsed.data), eq(supportTicket.traderId, session.user.id)))
    .limit(1);
  if (!ticket) return null;
  const messages = await db.select({
    id: supportTicketMessage.id,
    body: supportTicketMessage.body,
    createdAt: supportTicketMessage.createdAt,
    senderUserId: supportTicketMessage.senderUserId,
    senderName: user.name,
  }).from(supportTicketMessage)
    .leftJoin(user, eq(supportTicketMessage.senderUserId, user.id))
    .where(eq(supportTicketMessage.ticketId, ticket.id))
    .orderBy(asc(supportTicketMessage.createdAt));
  return { ticket, messages };
}

export async function sendTraderSupportTicketMessage(input: { ticketId: string; body: string }): Promise<{ success: true }> {
  const session = await requireTraderSession();
  const parsed = ticketMessageSchema.safeParse(input);
  if (!parsed.success) throw new Error("Enter a message of 2 to 5,000 characters.");
  const supportStaff = await getAuthorizedSupportStaff();
  try {
    const result = await db.transaction(async (tx) => {
      const [ticket] = await tx.select().from(supportTicket)
        .where(and(eq(supportTicket.id, parsed.data.ticketId), eq(supportTicket.traderId, session.user.id)))
        .for("update")
        .limit(1);
      if (!ticket) throw new SafeTicketError("Ticket not found.");
      if (ticket.status === "closed") throw new SafeTicketError("This ticket is closed. Open a new ticket if you still need help.");
      let nextStatus = ticket.status;
      if (ticket.status === "waiting_for_trader") {
        if (!canTransitionSupportTicket("waiting_for_trader", "in_progress")) throw new SafeTicketError("That status change is not allowed.");
        nextStatus = "in_progress";
      } else if (ticket.status === "resolved") {
        if (!canTransitionSupportTicket("resolved", "reopened")) throw new SafeTicketError("That status change is not allowed.");
        nextStatus = "reopened";
      } else if (!isSupportTicketStatus(ticket.status)) {
        throw new SafeTicketError("This ticket has an unsupported status and cannot be updated.");
      }
      const now = new Date();
      await tx.insert(supportTicketMessage).values({
        ticketId: ticket.id,
        senderUserId: session.user.id,
        body: parsed.data.body,
      });
      await tx.update(supportTicket).set({ status: nextStatus, reopenedAt: nextStatus === "reopened" ? now : ticket.reopenedAt, updatedAt: now })
        .where(eq(supportTicket.id, ticket.id));
      await recordTraderEvent(tx, {
        ticketId: ticket.id,
        actorUserId: session.user.id,
        eventType: nextStatus === "reopened" ? "ticket_reopened" : "trader_message_sent",
        previousStatus: nextStatus === ticket.status ? null : ticket.status,
        newStatus: nextStatus === ticket.status ? null : nextStatus,
        details: { characterCount: parsed.data.body.length },
      });
      const recipients = ticket.assignedToId
        ? [ticket.assignedToId]
        : supportStaff.map((employee) => employee.userId);
      const title = nextStatus === "reopened" ? "Support ticket reopened" : "New trader reply";
      const message = nextStatus === "reopened"
        ? "The trader replied and reopened ticket " + ticket.ticketReference + "."
        : "The trader replied to ticket " + ticket.ticketReference + ".";
      const notices = await storeTraderNotices(
        tx,
        recipients,
        title,
        message,
        "/admin/support/" + ticket.id,
      );
      return { notices, ticketId: ticket.id, title, message };
    });
    publishNotices(result.notices, result.title, result.message, "/admin/support/" + result.ticketId);
    return { success: true };
  } catch (error) {
    return safeServerFailure("trader_message", error);
  }
}

export async function confirmSupportTicketResolution(input: { ticketId: string; resolved: boolean; reason?: string }): Promise<{ success: true }> {
  const session = await requireTraderSession();
  const parsed = traderTicketConfirmationSchema.safeParse(input);
  if (!parsed.success) throw new Error("Unable to record your confirmation.");
  const supportStaff = await getAuthorizedSupportStaff();
  try {
    const result = await db.transaction(async (tx) => {
      const [ticket] = await tx.select().from(supportTicket)
        .where(and(eq(supportTicket.id, parsed.data.ticketId), eq(supportTicket.traderId, session.user.id)))
        .for("update")
        .limit(1);
      if (!ticket) throw new SafeTicketError("Ticket not found.");
      if (ticket.status !== "resolved") {
        if ((parsed.data.resolved && ticket.status === "closed") || (!parsed.data.resolved && ticket.status === "reopened")) {
          return { ticket, nextStatus: ticket.status, duplicate: true, notices: [] as string[] };
        }
        throw new SafeTicketError("Only a resolved ticket can be confirmed.");
      }
      const nextStatus = parsed.data.resolved ? "closed" : "reopened";
      if (!canTransitionSupportTicket("resolved", nextStatus)) throw new SafeTicketError("That status change is not allowed.");
      const now = new Date();
      await tx.update(supportTicket).set({
        status: nextStatus,
        closedAt: parsed.data.resolved ? now : ticket.closedAt,
        reopenedAt: parsed.data.resolved ? ticket.reopenedAt : now,
        updatedAt: now,
      }).where(eq(supportTicket.id, ticket.id));
      if (!parsed.data.resolved && parsed.data.reason) {
        await tx.insert(supportTicketMessage).values({
          ticketId: ticket.id,
          senderUserId: session.user.id,
          body: parsed.data.reason,
        });
      }
      await recordTraderEvent(tx, {
        ticketId: ticket.id,
        actorUserId: session.user.id,
        eventType: parsed.data.resolved ? "ticket_closed" : "ticket_reopened",
        previousStatus: "resolved",
        newStatus: nextStatus,
        details: {
          confirmationResult: parsed.data.resolved,
          ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
        },
      });
      const recipients = ticket.assignedToId
        ? [ticket.assignedToId]
        : supportStaff.map((employee) => employee.userId);
      const notices = await storeTraderNotices(
        tx,
        recipients,
        parsed.data.resolved ? "Ticket closed by trader" : "Ticket reopened by trader",
        "The trader " + (parsed.data.resolved ? "confirmed the resolution of " : "reopened ") + ticket.ticketReference + ".",
        "/admin/support/" + ticket.id,
      );
      return { ticket, nextStatus, duplicate: false, notices };
    });
    if (!result.duplicate) {
      publishNotices(
        result.notices,
        parsed.data.resolved ? "Ticket closed by trader" : "Ticket reopened by trader",
        "The trader updated ticket " + result.ticket.ticketReference + ".",
        "/admin/support/" + result.ticket.id,
      );
    }
    return { success: true };
  } catch (error) {
    return safeServerFailure("trader_confirmation", error);
  }
}
