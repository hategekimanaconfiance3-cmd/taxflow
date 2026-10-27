import "server-only";

import { and, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import db from "@/db/drizzle";
import { auditLog, rraStaff, user } from "@/db/schema";

const inputSchema = z.object({
  period: z.enum(["7d", "30d", "custom"]).default("7d"),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  staffRecordId: z.string().max(100).optional(),
});

export type StaffActivityFilters = z.infer<typeof inputSchema>;

export async function getStaffActivity(input: unknown, now = new Date()) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new Error("Choose valid staff activity filters.");
  const filters = parsed.data;
  let from: Date;
  let to = now;
  if (filters.period === "custom") {
    if (!filters.from || !filters.to) throw new Error("Choose both dates for a custom range.");
    from = new Date(`${filters.from}T00:00:00.000Z`);
    to = new Date(`${filters.to}T23:59:59.999Z`);
    if (from > to || to.getTime() - from.getTime() > 366 * 24 * 60 * 60_000) {
      throw new Error("Choose a valid date range of no more than one year.");
    }
  } else {
    from = new Date(now.getTime() - (filters.period === "30d" ? 30 : 7) * 24 * 60 * 60_000);
  }

  const conditions = [gte(auditLog.createdAt, from), lte(auditLog.createdAt, to)];
  if (filters.staffRecordId) conditions.push(eq(rraStaff.id, filters.staffRecordId));
  const [staff, events] = await Promise.all([
    db.select({ id: rraStaff.id, staffId: rraStaff.staffId, name: user.name, email: user.email, role: rraStaff.clearanceLevel })
      .from(rraStaff).innerJoin(user, eq(rraStaff.userId, user.id)).orderBy(rraStaff.staffId),
    db.select({
      id: auditLog.id,
      actorUserId: auditLog.userId,
      actor: user.name,
      email: user.email,
      staffId: rraStaff.staffId,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      beforeState: auditLog.beforeState,
      afterState: auditLog.afterState,
      metadata: auditLog.metadata,
      createdAt: auditLog.createdAt,
    }).from(auditLog)
      .innerJoin(user, eq(auditLog.userId, user.id))
      .innerJoin(rraStaff, eq(rraStaff.userId, user.id))
      .where(and(...conditions))
      .orderBy(desc(auditLog.createdAt)).limit(1000),
  ]);

  return { filters, from, to, staff, events, limit: 1000 };
}

function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value);
  const safe = /^[\s]*[=+@\-]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function staffActivityCsv(events: Awaited<ReturnType<typeof getStaffActivity>>["events"]): string {
  const header = ["timestamp", "staff_id", "staff_name", "staff_email", "action", "target_type", "target_id", "before_state", "after_state", "metadata"];
  const rows = events.map((event) => [event.createdAt.toISOString(), event.staffId, event.actor, event.email, event.action, event.targetType, event.targetId, event.beforeState, event.afterState, event.metadata]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
