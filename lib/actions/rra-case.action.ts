"use server";

import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import db from "@/db/drizzle";
import { auditLog, rraCase, rraCaseEvent, rraStaff, rraStaffRole, user } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireRRASession } from "@/lib/auth-guard";

const CASE_STATUSES = ["open", "in_progress", "awaiting_information", "closed"] as const;
const REVIEW_ROLES = ["compliance_officer", "audit_officer", "super_admin"] as const;
const TRADER_ROLE_FILTER = sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`;

const createCaseSchema = z.object({
  traderTin: z.string().trim().min(5).max(32),
  title: z.string().trim().min(3).max(120),
  reason: z.string().trim().min(10).max(1200),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
});

const updateCaseSchema = z.object({
  caseId: z.string().min(1).max(100),
  status: z.enum(CASE_STATUSES).optional(),
  assignedStaffId: z.string().min(1).max(100).nullable().optional(),
  note: z.string().trim().min(2).max(1500).optional(),
}).refine((value) => value.status !== undefined || value.assignedStaffId !== undefined || value.note !== undefined, {
  message: "Provide a status, assignment, or case note.",
});

export type RraCaseStatus = typeof CASE_STATUSES[number];

export async function getRraCases(filters: { status?: RraCaseStatus; query?: string } = {}) {
  await requireRRASession(...REVIEW_ROLES);
  const conditions = [];
  if (filters.status) conditions.push(eq(rraCase.status, filters.status));
  const query = filters.query?.trim();
  if (query) {
    const pattern = `%${query}%`;
    conditions.push(or(
      ilike(user.name, pattern),
      ilike(user.businessName, pattern),
      ilike(user.tinNumber, pattern),
      ilike(rraCase.title, pattern),
    )!);
  }

  const rows = await db
    .select({
      id: rraCase.id,
      traderId: rraCase.traderId,
      traderName: user.name,
      businessName: user.businessName,
      traderTin: user.tinNumber,
      traderRole: user.role,
      title: rraCase.title,
      reason: rraCase.reason,
      status: rraCase.status,
      priority: rraCase.priority,
      assignedStaffId: rraCase.assignedStaffId,
      createdAt: rraCase.createdAt,
      updatedAt: rraCase.updatedAt,
      closedAt: rraCase.closedAt,
    })
    .from(rraCase)
    .innerJoin(user, and(eq(rraCase.traderId, user.id), TRADER_ROLE_FILTER))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(rraCase.updatedAt))
    .limit(200);

  const staffIds = [...new Set(rows.map((row) => row.assignedStaffId).filter((id): id is string => Boolean(id)))];
  const assignedStaff = staffIds.length
    ? await db.select({ id: rraStaff.id, userName: user.name })
        .from(rraStaff).innerJoin(user, eq(rraStaff.userId, user.id)).where(inArray(rraStaff.id, staffIds))
    : [];
  const staffMap = new Map(assignedStaff.map((staff) => [staff.id, staff.userName]));
  return rows.map((row) => ({ ...row, assignedStaffName: row.assignedStaffId ? staffMap.get(row.assignedStaffId) ?? "Inactive officer" : null }));
}

export async function getRraCaseDetails(caseId: string) {
  await requireRRASession(...REVIEW_ROLES);
  const [record] = await db.select({
    id: rraCase.id,
    traderId: rraCase.traderId,
    traderName: user.name,
    businessName: user.businessName,
    traderTin: user.tinNumber,
    traderRole: user.role,
    title: rraCase.title,
    reason: rraCase.reason,
    status: rraCase.status,
    priority: rraCase.priority,
    assignedStaffId: rraCase.assignedStaffId,
    createdAt: rraCase.createdAt,
    updatedAt: rraCase.updatedAt,
    closedAt: rraCase.closedAt,
  }).from(rraCase)
    .innerJoin(user, and(eq(rraCase.traderId, user.id), TRADER_ROLE_FILTER))
    .where(eq(rraCase.id, caseId)).limit(1);
  if (!record) return null;

  const [events, officers] = await Promise.all([
    db.select({
      id: rraCaseEvent.id,
      eventType: rraCaseEvent.eventType,
      note: rraCaseEvent.note,
      fromValue: rraCaseEvent.fromValue,
      toValue: rraCaseEvent.toValue,
      createdAt: rraCaseEvent.createdAt,
      actorName: user.name,
    }).from(rraCaseEvent)
      .leftJoin(rraStaff, eq(rraCaseEvent.actorStaffId, rraStaff.id))
      .leftJoin(user, eq(rraStaff.userId, user.id))
      .where(eq(rraCaseEvent.caseId, caseId)).orderBy(desc(rraCaseEvent.createdAt)),
    db.select({
      id: rraStaff.id,
      name: user.name,
      clearanceLevel: rraStaffRole.role,
    }).from(rraStaffRole)
      .innerJoin(rraStaff, eq(rraStaffRole.staffRecordId, rraStaff.id))
      .innerJoin(user, eq(rraStaff.userId, user.id))
      .where(and(eq(rraStaff.isActive, true), inArray(rraStaffRole.role, [...REVIEW_ROLES]))),
  ]);

  const uniqueOfficers = [...new Map(officers.map((officer) => [officer.id, officer])).values()];
  return { ...record, events, officers: uniqueOfficers };
}

export async function createRraCase(input: unknown) {
  const { staff, user: actor } = await requireRRASession("compliance_officer");
  const parsed = createCaseSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message ?? "Invalid case details." };
  const [trader] = await db.select({ id: user.id, name: user.name, businessName: user.businessName, role: user.role })
    .from(user).where(and(eq(user.tinNumber, parsed.data.traderTin), TRADER_ROLE_FILTER)).limit(1);
  if (!trader) return { success: false as const, error: "No registered manufacturer, wholesaler, or retailer found with that TIN." };

  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(rraCase).values({
      id,
      traderId: trader.id,
      title: parsed.data.title,
      reason: parsed.data.reason,
      priority: parsed.data.priority,
      createdByStaffId: staff.id,
    });
    await tx.insert(rraCaseEvent).values({ id: crypto.randomUUID(), caseId: id, actorStaffId: staff.id, eventType: "case_opened", note: parsed.data.reason, toValue: "open" });
    await logAudit({ userId: actor.id, action: "RRA_CASE_OPENED", targetType: "rra_case", targetId: id, metadata: { traderId: trader.id, traderRole: trader.role, priority: parsed.data.priority } }, async (entry) => { await tx.insert(auditLog).values(entry); });
  });
  return { success: true as const, caseId: id, traderName: trader.businessName ?? trader.name };
}

export async function updateRraCase(input: unknown) {
  const { staff, user: actor } = await requireRRASession(...REVIEW_ROLES);
  const parsed = updateCaseSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message ?? "Invalid case update." };
  const data = parsed.data;

  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(rraCase).where(eq(rraCase.id, data.caseId)).limit(1);
    if (!current) return { success: false as const, error: "Case not found." };
    if (current.status === "closed" && (data.status && data.status !== "closed" || data.assignedStaffId !== undefined || data.note)) {
      return { success: false as const, error: "Closed cases cannot be changed." };
    }

    const events: Array<typeof rraCaseEvent.$inferInsert> = [];
    const updates: Partial<typeof rraCase.$inferInsert> = { updatedAt: new Date() };
    if (data.status && data.status !== current.status) {
      updates.status = data.status;
      updates.closedAt = data.status === "closed" ? new Date() : null;
      events.push({ id: crypto.randomUUID(), caseId: current.id, actorStaffId: staff.id, eventType: "status_changed", fromValue: current.status, toValue: data.status, note: data.status === "closed" ? "Case closed for officer follow-up tracking." : null });
    }
    if (data.assignedStaffId !== undefined && data.assignedStaffId !== current.assignedStaffId) {
      if (data.assignedStaffId !== null) {
        const [assignee] = await tx.select({ id: rraStaff.id }).from(rraStaff)
          .innerJoin(rraStaffRole, eq(rraStaffRole.staffRecordId, rraStaff.id))
          .where(and(eq(rraStaff.id, data.assignedStaffId), eq(rraStaff.isActive, true), inArray(rraStaffRole.role, [...REVIEW_ROLES])))
          .limit(1);
        if (!assignee) return { success: false as const, error: "Choose an active compliance or audit officer." };
      }
      updates.assignedStaffId = data.assignedStaffId;
      events.push({ id: crypto.randomUUID(), caseId: current.id, actorStaffId: staff.id, eventType: "assignment_changed", fromValue: current.assignedStaffId, toValue: data.assignedStaffId, note: data.assignedStaffId ? "Case assignment updated." : "Case unassigned." });
    }
    if (data.note) events.push({ id: crypto.randomUUID(), caseId: current.id, actorStaffId: staff.id, eventType: "note_added", note: data.note });
    if (events.length === 0) return { success: true as const };

    await tx.update(rraCase).set(updates).where(eq(rraCase.id, current.id));
    await tx.insert(rraCaseEvent).values(events);
    await logAudit({
      userId: actor.id,
      action: "RRA_CASE_UPDATED",
      targetType: "rra_case",
      targetId: current.id,
      beforeState: { status: current.status, assignedStaffId: current.assignedStaffId },
      afterState: { status: updates.status ?? current.status, assignedStaffId: updates.assignedStaffId ?? current.assignedStaffId, addedNote: Boolean(data.note) },
    }, async (entry) => { await tx.insert(auditLog).values(entry); });
    return { success: true as const };
  });
  return result;
}
