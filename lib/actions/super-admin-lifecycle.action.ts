"use server";

import { and, asc, desc, eq, inArray, notExists, sql } from "drizzle-orm";
import db from "@/db/drizzle";
import { auditLog, transaction, user } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";

export async function getSuperAdminTraderLifecycle(now = new Date()) {
  await requireRRASession("super_admin");
  const pendingCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
  const thirtyDayCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
  const approvedEvents = db.select({ traderId: auditLog.targetId, approvedAt: sql<Date>`MIN(${auditLog.createdAt})`.as("approved_at") })
    .from(auditLog)
    .where(and(eq(auditLog.action, "CLEARANCE_UPDATED"), eq(auditLog.targetType, "user"), sql`${auditLog.afterState}->>'clearanceStatus' = 'approved'`))
    .groupBy(auditLog.targetId).as("recorded_first_approvals");
  const traderRoles = ["manufacturer", "wholesaler", "retailer"];
  const [statusRows, approvalDuration, reactivationRows, pendingOverdue, dormantApproved, overdueCountRows, dormantCountRows] = await Promise.all([
    db.select({ status: user.clearanceStatus, count: sql<number>`COUNT(*)::int` }).from(user)
      .where(inArray(user.role, traderRoles)).groupBy(user.clearanceStatus),
    db.select({
      averageDays: sql<number | null>`AVG(EXTRACT(EPOCH FROM (${approvedEvents.approvedAt} - ${user.createdAt})) / 86400)::float8`,
      count: sql<number>`COUNT(*)::int`,
    }).from(user).innerJoin(approvedEvents, eq(approvedEvents.traderId, user.id)).where(inArray(user.role, traderRoles)),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(auditLog)
      .where(and(eq(auditLog.action, "CLEARANCE_UPDATED"), eq(auditLog.targetType, "user"), sql`${auditLog.beforeState}->>'clearanceStatus' = 'suspended' AND ${auditLog.afterState}->>'clearanceStatus' = 'approved' AND ${auditLog.createdAt} >= ${thirtyDayCutoff}`)),
    db.select({ id: user.id, name: user.businessName, contactName: user.name, tin: user.tinNumber, role: user.role, status: user.clearanceStatus, registeredAt: user.createdAt })
      .from(user).where(and(inArray(user.role, traderRoles), eq(user.clearanceStatus, "pending"), sql`${user.createdAt} < ${pendingCutoff}`))
      .orderBy(asc(user.createdAt)).limit(50),
    db.select({ id: user.id, name: user.businessName, contactName: user.name, tin: user.tinNumber, role: user.role, status: user.clearanceStatus, createdAt: user.createdAt })
      .from(user).where(and(inArray(user.role, traderRoles), eq(user.clearanceStatus, "approved"), notExists(
        db.select({ id: transaction.id }).from(transaction).where(and(eq(transaction.sellerId, user.id), inArray(transaction.status, ["confirmed", "completed"]))),
      ))).orderBy(desc(user.createdAt)).limit(50),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(user)
      .where(and(inArray(user.role, traderRoles), eq(user.clearanceStatus, "pending"), sql`${user.createdAt} < ${pendingCutoff}`)),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(user)
      .where(and(inArray(user.role, traderRoles), eq(user.clearanceStatus, "approved"), notExists(
        db.select({ id: transaction.id }).from(transaction).where(and(eq(transaction.sellerId, user.id), inArray(transaction.status, ["confirmed", "completed"]))),
      ))),
  ]);
  const pendingRows = pendingOverdue.map((trader) => ({ ...trader, displayName: trader.name ?? trader.contactName }));
  const dormantRows = dormantApproved.map((trader) => ({ ...trader, displayName: trader.name ?? trader.contactName }));
  const statuses = { pending: 0, approved: 0, underReview: 0, suspended: 0 };
  for (const row of statusRows) {
    if (row.status === "pending") statuses.pending = Number(row.count);
    else if (row.status === "approved") statuses.approved = Number(row.count);
    else if (row.status === "under_review") statuses.underReview = Number(row.count);
    else if (row.status === "suspended") statuses.suspended = Number(row.count);
  }
  const averageDaysToApproval = approvalDuration[0]?.averageDays === null || approvalDuration[0]?.averageDays === undefined ? null : Number(approvalDuration[0].averageDays);
  return {
    total: statusRows.reduce((sum, row) => sum + Number(row.count), 0),
    statuses,
    pendingOverdue: pendingRows,
    pendingOverdueCount: Number(overdueCountRows[0]?.count ?? 0),
    dormantApproved: dormantRows,
    dormantApprovedCount: Number(dormantCountRows[0]?.count ?? 0),
    averageDaysToApproval,
    approvalDurationsCount: Number(approvalDuration[0]?.count ?? 0),
    reinstatementsLast30Days: Number(reactivationRows[0]?.count ?? 0),
    computedAt: now,
  };
}
