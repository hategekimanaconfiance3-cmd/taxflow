"use server";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import db from "@/db/drizzle";
import { rraStaff, rraStaffRole, supportTicket, supportTicketMessage, user } from "@/db/schema";
import { requireRRAOperationalPermission } from "@/lib/auth-guard";
import { createNotification } from "@/lib/notifications";
import { hasOperationalRRAPermission, isRRARole } from "@/lib/rra-rbac";
import { assignSupportTicketInTransaction, replyToSupportTicketInTransaction, updateSupportTicketStatusInTransaction } from "@/lib/services/admin-support-ticket";

const idSchema = z.string().trim().min(1).max(128);
const messageSchema = z.string().trim().min(1).max(10_000);
const resolutionSchema = z.string().trim().min(10).max(2_000);
const statusSchema = z.enum(["open", "in_progress", "resolved", "closed"]);

async function notifyTrader(userId: string, subject: string, message: string): Promise<void> {
  try {
    await createNotification({ userId, type: "ticket_update", title: subject, message, link: "/dashboard/support" });
  } catch (error) {
    console.error("Support ticket notification failed", { errorName: error instanceof Error ? error.name : typeof error });
  }
}

export async function getAllTickets(status?: string, tin?: string) {
  await requireRRAOperationalPermission("support.read");

  const conditions = [];
  if (status) {
    const parsedStatus = statusSchema.safeParse(status);
    if (!parsedStatus.success) throw new Error("Choose a valid ticket status.");
    conditions.push(eq(supportTicket.status, parsedStatus.data));
  }
  if (tin) {
    const normalizedTin = tin.trim();
    if (normalizedTin.length < 5 || normalizedTin.length > 32 || !/^[A-Za-z0-9-]+$/.test(normalizedTin)) {
      throw new Error("Enter a valid TIN to filter support tickets.");
    }
    conditions.push(eq(user.tinNumber, normalizedTin));
  }

  return db.select({
    id: supportTicket.id,
    traderName: user.businessName,
    traderId: supportTicket.traderId,
    category: supportTicket.category,
    subject: supportTicket.subject,
    status: supportTicket.status,
    priority: supportTicket.priority,
    assignedToId: supportTicket.assignedToId,
    createdAt: supportTicket.createdAt,
    resolvedAt: supportTicket.resolvedAt,
  }).from(supportTicket)
    .innerJoin(user, eq(supportTicket.traderId, user.id))
    .where(conditions.length ? and(...conditions) : sql`1 = 1`)
    .orderBy(desc(supportTicket.createdAt))
    .limit(100);
}

export async function getAdminTicket(ticketId: string) {
  await requireRRAOperationalPermission("support.read");
  const parsedId = idSchema.safeParse(ticketId);
  if (!parsedId.success) throw new Error("Ticket not found.");

  const [ticket] = await db.select({
    id: supportTicket.id,
    traderId: supportTicket.traderId,
    traderName: user.businessName,
    traderTin: user.tinNumber,
    subject: supportTicket.subject,
    description: supportTicket.description,
    category: supportTicket.category,
    status: supportTicket.status,
    priority: supportTicket.priority,
    assignedToId: supportTicket.assignedToId,
    resolution: supportTicket.resolution,
    createdAt: supportTicket.createdAt,
    updatedAt: supportTicket.updatedAt,
    resolvedAt: supportTicket.resolvedAt,
  }).from(supportTicket).innerJoin(user, eq(supportTicket.traderId, user.id))
    .where(eq(supportTicket.id, parsedId.data)).limit(1);
  if (!ticket) throw new Error("Ticket not found.");

  const messages = await db.select({
    id: supportTicketMessage.id,
    authorId: supportTicketMessage.authorId,
    authorName: user.name,
    body: supportTicketMessage.body,
    createdAt: supportTicketMessage.createdAt,
  }).from(supportTicketMessage)
    .innerJoin(user, eq(supportTicketMessage.authorId, user.id))
    .where(eq(supportTicketMessage.ticketId, parsedId.data))
    .orderBy(supportTicketMessage.createdAt);
  return { ...ticket, messages };
}

export async function getSupportAssignees() {
  await requireRRAOperationalPermission("support.manage");
  const records = await db.select({ staffId: rraStaff.id, userId: user.id, name: user.name, primaryRole: rraStaff.clearanceLevel })
    .from(rraStaff).innerJoin(user, eq(rraStaff.userId, user.id)).where(eq(rraStaff.isActive, true));
  if (records.length === 0) return [];
  const roleRows = await db.select({ staffRecordId: rraStaffRole.staffRecordId, role: rraStaffRole.role }).from(rraStaffRole)
    .where(inArray(rraStaffRole.staffRecordId, records.map((record) => record.staffId)));
  const rolesByStaff = new Map<string, string[]>();
  for (const row of roleRows) rolesByStaff.set(row.staffRecordId, [...(rolesByStaff.get(row.staffRecordId) ?? []), row.role]);
  return records.filter((record) => {
    const roles = (rolesByStaff.get(record.staffId) ?? [record.primaryRole]).filter(isRRARole);
    return hasOperationalRRAPermission(roles, "support.manage");
  }).map(({ userId, name }) => ({ userId, name }));
}

export async function assignTicket(ticketId: string, staffUserId: string): Promise<{ success: true }> {
  const { staff, user: actor } = await requireRRAOperationalPermission("support.manage");
  const parsed = z.object({ ticketId: idSchema, staffUserId: idSchema }).safeParse({ ticketId, staffUserId });
  if (!parsed.success) throw new Error("Choose a valid ticket and staff member.");

  const result = await db.transaction((tx) => assignSupportTicketInTransaction(tx, {
    ticketId: parsed.data.ticketId, assigneeUserId: parsed.data.staffUserId, actorId: actor.id, actorStaffId: staff.staffId, roles: staff.clearanceRoles,
  }));
  await notifyTrader(result.traderId, "Support Ticket Update", `Your ticket "${result.subject}" has been assigned to a staff member and is being reviewed.`);
  return { success: true };
}

export async function replyToTicket(ticketId: string, body: string): Promise<{ success: true }> {
  const { user: actor, staff } = await requireRRAOperationalPermission("support.manage");
  const parsed = z.object({ ticketId: idSchema, body: messageSchema }).safeParse({ ticketId, body });
  if (!parsed.success) throw new Error("Enter a reply of up to 10,000 characters.");
  const result = await db.transaction((tx) => replyToSupportTicketInTransaction(tx, {
    ticketId: parsed.data.ticketId, body: parsed.data.body, actorId: actor.id, roles: staff.clearanceRoles,
  }));
  await notifyTrader(result.traderId, "New Support Ticket Reply", `RRA staff replied to your ticket "${result.subject}".`);
  return { success: true };
}

export async function updateTicketStatus(ticketId: string, nextStatus: z.infer<typeof statusSchema>, resolution?: string): Promise<{ success: true }> {
  const { user: actor, staff } = await requireRRAOperationalPermission("support.manage");
  const parsed = z.object({ ticketId: idSchema, nextStatus: statusSchema, resolution: resolutionSchema.optional() }).safeParse({ ticketId, nextStatus, resolution });
  if (!parsed.success) throw new Error("Enter a valid status and, when resolving, a resolution of at least 10 characters.");
  if (parsed.data.nextStatus === "resolved" && !parsed.data.resolution) throw new Error("A resolution of at least 10 characters is required.");
  const result = await db.transaction((tx) => updateSupportTicketStatusInTransaction(tx, {
    ticketId: parsed.data.ticketId, nextStatus: parsed.data.nextStatus, resolution: parsed.data.resolution, actorId: actor.id, roles: staff.clearanceRoles,
  }));
  await notifyTrader(result.traderId, "Support Ticket Update", `Your ticket "${result.subject}" is now ${result.status.replace("_", " ")}.`);
  return { success: true };
}

export async function getTicketStats() {
  await requireRRAOperationalPermission("support.read");
  const [stats] = await db.select({
    total: sql<number>`COUNT(*)::int`.as("total"),
    open: sql<number>`COUNT(*) FILTER (WHERE ${supportTicket.status} = 'open')::int`.as("open"),
    inProgress: sql<number>`COUNT(*) FILTER (WHERE ${supportTicket.status} = 'in_progress')::int`.as("in_progress"),
    resolved: sql<number>`COUNT(*) FILTER (WHERE ${supportTicket.status} = 'resolved')::int`.as("resolved"),
    closed: sql<number>`COUNT(*) FILTER (WHERE ${supportTicket.status} = 'closed')::int`.as("closed"),
  }).from(supportTicket);
  return { total: stats?.total ?? 0, open: stats?.open ?? 0, inProgress: stats?.inProgress ?? 0, resolved: stats?.resolved ?? 0, closed: stats?.closed ?? 0 };
}
