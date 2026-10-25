import { and, eq } from "drizzle-orm";
import db from "@/db/drizzle";
import { auditLog, rraStaff, rraStaffRole, supportTicket, supportTicketMessage, user } from "@/db/schema";
import { hasOperationalRRAPermission, isRRARole, type RRARole } from "@/lib/rra-rbac";

export type SupportTicketTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type SupportTicketAuditEntry = typeof auditLog.$inferInsert;
export type SupportTicketAuditWriter = (tx: SupportTicketTransaction, entry: SupportTicketAuditEntry) => Promise<void>;

const writeAudit: SupportTicketAuditWriter = async (tx, entry) => { await tx.insert(auditLog).values(entry); };

function assertSupportRole(roles: readonly RRARole[]): void {
  if (!hasOperationalRRAPermission(roles, "support.manage")) throw new Error("You do not have permission to manage support tickets.");
}

function makeAudit(actorId: string, action: string, ticketId: string, beforeState: Record<string, unknown>, afterState: Record<string, unknown>, metadata?: Record<string, unknown>): SupportTicketAuditEntry {
  return {
    userId: actorId,
    action,
    targetType: "support_ticket",
    targetId: ticketId,
    metadata: metadata ? JSON.stringify(metadata) : null,
    beforeState,
    afterState,
  };
}

export async function assignSupportTicketInTransaction(
  tx: SupportTicketTransaction,
  input: { ticketId: string; assigneeUserId: string; actorId: string; actorStaffId: string; roles: readonly RRARole[] },
  auditWriter: SupportTicketAuditWriter = writeAudit,
) {
  assertSupportRole(input.roles);
  const [ticket] = await tx.select().from(supportTicket).where(eq(supportTicket.id, input.ticketId)).limit(1).for("update");
  if (!ticket) throw new Error("Ticket not found.");
  if (ticket.status === "closed") throw new Error("Reopen the ticket before assigning it.");
  const [assignee] = await tx.select({ staffRecordId: rraStaff.id, active: rraStaff.isActive, primaryRole: rraStaff.clearanceLevel })
    .from(user).innerJoin(rraStaff, eq(rraStaff.userId, user.id)).where(eq(user.id, input.assigneeUserId)).limit(1);
  if (!assignee?.active) throw new Error("Choose an active support staff member.");
  const assignments = await tx.select({ role: rraStaffRole.role }).from(rraStaffRole).where(eq(rraStaffRole.staffRecordId, assignee.staffRecordId));
  const effectiveRoles = (assignments.length ? assignments.map((row) => row.role) : [assignee.primaryRole]).filter(isRRARole);
  if (!hasOperationalRRAPermission(effectiveRoles, "support.manage")) throw new Error("That staff member is not authorized to handle support tickets.");

  const [updated] = await tx.update(supportTicket).set({ assignedToId: input.assigneeUserId, status: "in_progress", updatedAt: new Date() })
    .where(and(eq(supportTicket.id, ticket.id), eq(supportTicket.status, ticket.status)))
    .returning({ id: supportTicket.id, traderId: supportTicket.traderId, subject: supportTicket.subject, status: supportTicket.status });
  if (!updated) throw new Error("Ticket changed while it was being assigned. Refresh and try again.");
  await auditWriter(tx, makeAudit(input.actorId, "TICKET_ASSIGNED", ticket.id,
    { assignedToId: ticket.assignedToId, status: ticket.status }, { assignedToId: input.assigneeUserId, status: updated.status }, { assignedByStaffId: input.actorStaffId }));
  return updated;
}

export async function replyToSupportTicketInTransaction(
  tx: SupportTicketTransaction,
  input: { ticketId: string; body: string; actorId: string; roles: readonly RRARole[] },
  auditWriter: SupportTicketAuditWriter = writeAudit,
) {
  assertSupportRole(input.roles);
  if (!input.body.trim() || input.body.trim().length > 10_000) throw new Error("Enter a reply of up to 10,000 characters.");
  const [ticket] = await tx.select().from(supportTicket).where(eq(supportTicket.id, input.ticketId)).limit(1).for("update");
  if (!ticket) throw new Error("Ticket not found.");
  if (ticket.status === "closed") throw new Error("Reopen the ticket before replying.");
  const [message] = await tx.insert(supportTicketMessage).values({ ticketId: ticket.id, authorId: input.actorId, body: input.body.trim() }).returning({ id: supportTicketMessage.id });
  if (!message) throw new Error("Reply was not saved.");
  const [updated] = await tx.update(supportTicket).set({ updatedAt: new Date() })
    .where(and(eq(supportTicket.id, ticket.id), eq(supportTicket.status, ticket.status)))
    .returning({ id: supportTicket.id, traderId: supportTicket.traderId, subject: supportTicket.subject });
  if (!updated) throw new Error("Ticket changed while replying. Refresh and try again.");
  await auditWriter(tx, makeAudit(input.actorId, "TICKET_REPLIED", ticket.id, {}, { messageId: message.id }, { messageLength: input.body.trim().length }));
  return updated;
}

export async function updateSupportTicketStatusInTransaction(
  tx: SupportTicketTransaction,
  input: { ticketId: string; nextStatus: "open" | "in_progress" | "resolved" | "closed"; resolution?: string; actorId: string; roles: readonly RRARole[] },
  auditWriter: SupportTicketAuditWriter = writeAudit,
) {
  assertSupportRole(input.roles);
  if (input.nextStatus === "resolved" && (!input.resolution?.trim() || input.resolution.trim().length < 10 || input.resolution.trim().length > 2_000)) {
    throw new Error("A resolution between 10 and 2,000 characters is required.");
  }
  const [ticket] = await tx.select().from(supportTicket).where(eq(supportTicket.id, input.ticketId)).limit(1).for("update");
  if (!ticket) throw new Error("Ticket not found.");
  type TicketStatus = typeof input.nextStatus;
  const transitions: Record<TicketStatus, readonly TicketStatus[]> = {
    open: ["in_progress"], in_progress: ["open", "resolved"], resolved: ["in_progress", "closed"], closed: ["in_progress"],
  };
  if (ticket.status === input.nextStatus || !transitions[ticket.status as TicketStatus]?.includes(input.nextStatus)) throw new Error("That ticket status change is not allowed.");
  const now = new Date();
  const [updated] = await tx.update(supportTicket).set({
    status: input.nextStatus,
    resolution: input.nextStatus === "resolved" ? input.resolution?.trim() : ticket.resolution,
    resolvedAt: input.nextStatus === "resolved" ? now : input.nextStatus === "in_progress" ? null : ticket.resolvedAt,
    updatedAt: now,
  }).where(and(eq(supportTicket.id, ticket.id), eq(supportTicket.status, ticket.status)))
    .returning({ id: supportTicket.id, traderId: supportTicket.traderId, subject: supportTicket.subject, status: supportTicket.status });
  if (!updated) throw new Error("Ticket changed while updating its status. Refresh and try again.");
  await auditWriter(tx, makeAudit(input.actorId, "TICKET_STATUS_UPDATED", ticket.id,
    { status: ticket.status, resolution: ticket.resolution }, { status: updated.status, resolution: input.resolution?.trim() ?? ticket.resolution }));
  return updated;
}
