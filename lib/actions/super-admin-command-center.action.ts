"use server";

import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { ilike, or } from "drizzle-orm";
import { z } from "zod";
import db from "@/db/drizzle";
import { aiFinding, auditLog, product, productionBatch, rraCase, rraStaff, session, stock, stockMovement, supportTicket, transaction, user } from "@/db/schema";
import { getDashboardOverview } from "@/lib/actions/admin-dashboard.action";
import { requireRRASession } from "@/lib/auth-guard";
import { parseSuperAdminDashboardFilters, resolveSuperAdminComparisonRange, resolveSuperAdminDashboardRange } from "@/lib/super-admin-command-center";

export async function getSuperAdminCommandCenter(input: unknown) {
  const parsed = parseSuperAdminDashboardFilters(input);
  if (!parsed.success) throw new Error("Choose a valid period and date range.");
  await requireRRASession("super_admin");
  const now = new Date();
  const range = resolveSuperAdminDashboardRange(parsed.data, now);
  const comparison = resolveSuperAdminComparisonRange(range, parsed.data.comparison);
  const cutoff5 = new Date(now.getTime() - 5 * 60_000);
  const cutoff15 = new Date(now.getTime() - 15 * 60_000);
  const cutoff60 = new Date(now.getTime() - 60 * 60_000);
  const chartBucket = parsed.data.period === "today" ? "hour" : "day";

  try {
    const [overview, activeBusinesses, stockSnapshot, movements, production, latestTransaction, selectedValue, priorValue, recentActivity, seriesRows, rankedBusinesses] = await Promise.all([
      getDashboardOverview(range.from, range.to),
      db.select({ count: sql<number>`COUNT(*)::int` }).from(user)
        .where(and(inArray(user.role, ["manufacturer", "wholesaler", "retailer"]), eq(user.isActive, true))),
      db.select({ units: sql<number>`COALESCE(SUM(${stock.quantity}),0)::float8`, businesses: sql<number>`COUNT(DISTINCT ${stock.businessId})::int` }).from(stock),
      db.select({ businessId: user.id, business: user.businessName, productId: stockMovement.productId, delta: sql<number>`COALESCE(SUM(${stockMovement.quantityDelta}),0)::float8`, count: sql<number>`COUNT(*)::int` })
        .from(stockMovement).innerJoin(user, eq(stockMovement.businessId, user.id))
        .where(and(gte(stockMovement.createdAt, range.from), lte(stockMovement.createdAt, range.to)))
        .groupBy(user.id, user.businessName, stockMovement.productId)
        .orderBy(desc(sql`ABS(COALESCE(SUM(${stockMovement.quantityDelta}),0))`)).limit(8),
      db.select({ batches: sql<number>`COUNT(*)::int`, units: sql<number>`COALESCE(SUM(${productionBatch.declaredQuantity}),0)::float8` }).from(productionBatch)
        .where(and(gte(productionBatch.createdAt, range.from), lte(productionBatch.createdAt, range.to))),
      db.select({ at: sql<Date | null>`MAX(${transaction.createdAt})` }).from(transaction),
      db.select({ value: sql<number>`COALESCE(SUM(${transaction.totalAmount}) FILTER (WHERE ${transaction.status} IN ('confirmed','completed')),0)::float8` })
        .from(transaction).where(and(gte(transaction.createdAt, range.from), lte(transaction.createdAt, range.to))),
      db.select({ value: sql<number>`COALESCE(SUM(${transaction.totalAmount}) FILTER (WHERE ${transaction.status} IN ('confirmed','completed')),0)::float8` })
        .from(transaction).where(and(gte(transaction.createdAt, comparison.from), lte(transaction.createdAt, comparison.to))),
      db.select({
        five: sql<number>`COUNT(*) FILTER (WHERE ${transaction.createdAt} >= ${cutoff5})::int`,
        fifteen: sql<number>`COUNT(*) FILTER (WHERE ${transaction.createdAt} >= ${cutoff15})::int`,
        hour: sql<number>`COUNT(*) FILTER (WHERE ${transaction.createdAt} >= ${cutoff60})::int`,
      }).from(transaction).where(gte(transaction.createdAt, cutoff60)),
      db.select({ date: sql<Date>`date_trunc(${chartBucket}, ${transaction.createdAt})`, count: sql<number>`COUNT(*)::int` }).from(transaction)
        .where(and(gte(transaction.createdAt, range.from), lte(transaction.createdAt, range.to)))
        .groupBy(sql`date_trunc(${chartBucket}, ${transaction.createdAt})`).orderBy(asc(sql`date_trunc(${chartBucket}, ${transaction.createdAt})`)),
      db.select({ id: user.id, name: user.businessName, tin: user.tinNumber, role: user.role, count: sql<number>`COUNT(${transaction.id})::int`, value: sql<number>`COALESCE(SUM(${transaction.totalAmount}),0)::float8` })
        .from(transaction).innerJoin(user, eq(transaction.sellerId, user.id))
        .where(and(gte(transaction.createdAt, range.from), lte(transaction.createdAt, range.to), inArray(transaction.status, ["confirmed", "completed"])))
        .groupBy(user.id, user.businessName, user.tinNumber, user.role).orderBy(desc(sql`COALESCE(SUM(${transaction.totalAmount}),0)`)).limit(8),
    ]);

    const [findingRows, qualityRows, findingFreshness] = await Promise.all([
      db.select({ id: aiFinding.id, type: aiFinding.findingType, severity: aiFinding.severity, status: aiFinding.reviewStatus, reason: aiFinding.explanation, observed: aiFinding.observedValue, expected: aiFinding.expectedValue, evidence: aiFinding.evidenceRefs, at: aiFinding.createdAt, businessId: aiFinding.businessId, business: user.businessName, tin: user.tinNumber, productId: aiFinding.productId })
        .from(aiFinding).leftJoin(user, eq(aiFinding.businessId, user.id))
        .where(and(inArray(aiFinding.reviewStatus, ["open", "under_review", "pending"]), gte(aiFinding.createdAt, range.from), lte(aiFinding.createdAt, range.to)))
        .orderBy(desc(aiFinding.createdAt)).limit(10)
        .catch((error: unknown) => { logCommandCenterFailure("Super Admin risk findings unavailable", error); return null; }),
      db.select({ count: sql<number>`COUNT(*)::int` }).from(aiFinding)
        .where(and(eq(aiFinding.findingType, "data_quality"), inArray(aiFinding.reviewStatus, ["open", "under_review", "pending"])))
        .catch((error: unknown) => { logCommandCenterFailure("Super Admin data-quality findings unavailable", error); return null; }),
      db.select({ at: sql<Date | null>`MAX(${aiFinding.createdAt})` }).from(aiFinding)
        .catch((error: unknown) => { logCommandCenterFailure("Super Admin findings freshness unavailable", error); return null; }),
    ]);

    const current = Number(selectedValue[0]?.value ?? 0);
    const prior = Number(priorValue[0]?.value ?? 0);
    const trend = prior === 0 ? (current === 0 ? "No recorded value in either range" : "New recorded value against selected baseline") : String(Math.round((current - prior) / prior * 100)) + "% vs " + comparison.label;
    const parseEvidence = (value: string | null): string[] => {
      if (!value) return [];
      try {
        const json: unknown = JSON.parse(value);
        if (Array.isArray(json)) return json.filter((id): id is string => typeof id === "string").slice(0, 8);
        if (json && typeof json === "object") {
          const record = json as Record<string, unknown>;
          return [record.transactionIds, record.stockIds].flatMap((ids) => Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string").slice(0, 8) : []);
        }
      } catch { return []; }
      return [];
    };

    return {
      period: { label: range.label, comparison: comparison.label },
      refreshedAt: now.toISOString(),
      sourceFreshness: [latestTransaction[0]?.at ?? null, findingFreshness?.[0]?.at ?? null].map((at) => at ? new Date(at).toISOString() : null),
      riskSourceAvailable: findingRows !== null && qualityRows !== null && findingFreshness !== null,
      businesses: {
        ...overview.traders,
        active: Number(activeBusinesses[0]?.count ?? 0),
        manufacturers: overview.traders.byRole.manufacturer ?? 0,
        wholesalers: overview.traders.byRole.wholesaler ?? 0,
        retailers: overview.traders.byRole.retailer ?? 0,
      },
      transactions: {
        ...overview.transactions,
        confirmedValue: current,
        comparison: trend,
        windows: { five: Number(recentActivity[0]?.five ?? 0), fifteen: Number(recentActivity[0]?.fifteen ?? 0), hour: Number(recentActivity[0]?.hour ?? 0) },
        series: seriesRows.map((row) => ({ date: row.date.toISOString(), count: Number(row.count) })),
      },
      tax: {
        output: overview.revenue.vatOutput, input: overview.revenue.vatInput,
        payments: overview.revenue.taxPaymentsTotal, paymentCount: overview.revenue.taxPaymentsCount,
        comparison: "Unavailable — confirmed payments are not linked to matched VAT liabilities.",
      },
      risks: (findingRows ?? []).map((row) => ({
        id: row.id, type: row.type, severity: row.severity, status: row.status ?? "open", reason: row.reason,
        observed: row.observed, expected: row.expected, evidence: parseEvidence(row.evidence), at: row.at.toISOString(),
        businessId: row.businessId, business: row.business ?? "System-level signal", tin: row.tin, productId: row.productId,
      })),
      dataQuality: qualityRows ? Number(qualityRows[0]?.count ?? 0) : null,
      stock: {
        units: Number(stockSnapshot[0]?.units ?? 0), businesses: Number(stockSnapshot[0]?.businesses ?? 0),
        movements: movements.map((row) => ({ businessId: row.businessId, business: row.business ?? "Unnamed business", productId: row.productId, delta: Number(row.delta), count: Number(row.count) })),
      },
      production: { batches: Number(production[0]?.batches ?? 0), declaredUnits: Number(production[0]?.units ?? 0) },
      businessesByValue: rankedBusinesses.map((row) => ({ id: row.id, name: row.name ?? "Unnamed business", tin: row.tin, role: row.role, transactions: Number(row.count), value: Number(row.value) })),
      definitions: {
        transaction: "Confirmed/completed seller-side transaction records; other transaction status counts are shown separately.",
        vat: "Recorded vat_record amounts by type and creation date. This is not an official tax liability calculation.",
        payment: "Confirmed tax_payment records by creation date.",
        stock: "Current stock snapshot; movement totals include only append-only stock_movement records.",
        production: "Manufacturer-declared batch quantities; declarations are not independent physical verification.",
      },
    };
  } catch (error) {
    logCommandCenterFailure("Super Admin command center query failed", error);
    throw new Error("Command center data is temporarily unavailable. Please retry in a moment.");
  }
}

export async function getSuperAdminControlPlaneSummary() {
  await requireRRASession("super_admin");
  const now = new Date();
  const recentCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
  const [staffCounts, currentSessions, roleChanges] = await Promise.all([
    db.select({ total: sql<number>`COUNT(*)::int`, active: sql<number>`COUNT(*) FILTER (WHERE ${rraStaff.isActive})::int` }).from(rraStaff),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(session)
      .innerJoin(rraStaff, eq(rraStaff.userId, session.userId))
      .where(and(eq(rraStaff.isActive, true), gte(session.expiresAt, now))),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(auditLog)
      .where(and(eq(auditLog.action, "STAFF_ROLES_UPDATED"), gte(auditLog.createdAt, recentCutoff))),
  ]);
  return {
    administrators: Number(staffCounts[0]?.total ?? 0),
    activeAdministrators: Number(staffCounts[0]?.active ?? 0),
    currentStaffSessions: Number(currentSessions[0]?.count ?? 0),
    roleChangesLast30Days: Number(roleChanges[0]?.count ?? 0),
  };
}

function logCommandCenterFailure(operation: string, error: unknown) {
  const candidate = error && typeof error === "object" ? error as { code?: unknown; cause?: { code?: unknown } } : null;
  const code = candidate?.code ?? candidate?.cause?.code;
  console.error(operation, {
    errorName: error instanceof Error ? error.name : typeof error,
    databaseCode: typeof code === "string" ? code : undefined,
  });
}

const commandQuerySchema = z.string().trim().min(2).max(100);

export async function searchSuperAdminCommand(input: unknown) {
  const parsed = commandQuerySchema.safeParse(input);
  if (!parsed.success) return { results: [], unavailableSources: [] as string[] };
  await requireRRASession("super_admin");
  const query = "%" + parsed.data + "%";
  const unavailableSources: string[] = [];
  const readRows = <T,>(source: string, result: PromiseSettledResult<T[]>): T[] => {
    if (result.status === "fulfilled") return result.value;
    unavailableSources.push(source);
    logCommandCenterFailure("Super Admin command search source failed: " + source, result.reason);
    return [];
  };

  try {
    const settled = await Promise.allSettled([
      db.select({ id: user.id, name: user.businessName, tin: user.tinNumber, role: user.role }).from(user)
        .where(and(sql`${user.role} IN ('manufacturer','wholesaler','retailer')`, or(ilike(user.businessName, query), ilike(user.tinNumber, query), ilike(user.name, query)))).limit(5),
      db.select({ id: product.id, name: product.name, category: product.categoryCode }).from(product)
        .where(or(ilike(product.id, query), ilike(product.name, query), ilike(product.categoryCode, query))).limit(5),
      db.select({ id: transaction.id, business: user.businessName, item: product.name, status: transaction.status }).from(transaction)
        .innerJoin(user, eq(transaction.sellerId, user.id)).innerJoin(product, eq(transaction.productId, product.id))
        .where(or(ilike(transaction.id, query), ilike(user.businessName, query), ilike(product.name, query))).orderBy(desc(transaction.createdAt)).limit(5),
      db.select({ id: aiFinding.id, type: aiFinding.findingType, severity: aiFinding.severity, business: user.businessName }).from(aiFinding)
        .leftJoin(user, eq(aiFinding.businessId, user.id)).where(or(ilike(aiFinding.id, query), ilike(aiFinding.findingType, query), ilike(aiFinding.explanation, query))).orderBy(desc(aiFinding.createdAt)).limit(5),
      db.select({ id: rraCase.id, title: rraCase.title, status: rraCase.status, business: user.businessName }).from(rraCase)
        .innerJoin(user, eq(rraCase.traderId, user.id)).where(or(ilike(rraCase.id, query), ilike(rraCase.title, query), ilike(user.businessName, query))).orderBy(desc(rraCase.updatedAt)).limit(5),
      db.select({ id: rraStaff.id, staffId: rraStaff.staffId, name: user.name, email: user.email, role: rraStaff.clearanceLevel, isActive: rraStaff.isActive }).from(rraStaff)
        .innerJoin(user, eq(rraStaff.userId, user.id)).where(or(ilike(rraStaff.staffId, query), ilike(user.name, query), ilike(user.email, query))).orderBy(asc(rraStaff.staffId)).limit(5),
      db.select({ id: supportTicket.id, subject: supportTicket.subject, status: supportTicket.status, trader: user.businessName }).from(supportTicket)
        .innerJoin(user, eq(supportTicket.traderId, user.id)).where(or(ilike(supportTicket.id, query), ilike(supportTicket.subject, query), ilike(user.businessName, query))).orderBy(desc(supportTicket.updatedAt)).limit(5),
      db.select({ id: auditLog.id, action: auditLog.action, targetType: auditLog.targetType, targetId: auditLog.targetId }).from(auditLog)
        .where(or(ilike(auditLog.id, query), ilike(auditLog.action, query), ilike(auditLog.targetId, query))).orderBy(desc(auditLog.createdAt)).limit(5),
    ] as const);
    const businesses = readRows("business directory", settled[0]);
    const productsFound = readRows("products", settled[1]);
    const transactionsFound = readRows("transactions", settled[2]);
    const findings = readRows("risk signals", settled[3]);
    const cases = readRows("investigations", settled[4]);
    const admins = readRows("administrators", settled[5]);
    const tickets = readRows("support tickets", settled[6]);
    const auditEvents = readRows("audit events", settled[7]);

    return {
      results: [
        ...businesses.map((row) => ({ id: row.id, title: row.name ?? row.tin ?? "Business", detail: row.role + " · TIN " + (row.tin ?? "unavailable"), kind: "Business", href: "/admin/directory/business/" + row.id })),
        ...productsFound.map((row) => ({ id: row.id, title: row.name, detail: row.category ?? "Product", kind: "Product", href: "/admin/product-journey?productId=" + encodeURIComponent(row.id) })),
        ...transactionsFound.map((row) => ({ id: row.id, title: row.id, detail: (row.business ?? "Business") + " · " + row.item + " · " + row.status, kind: "Transaction", href: "/admin/transactions" })),
        ...findings.map((row) => ({ id: row.id, title: row.type.replaceAll("_", " "), detail: row.severity + " · " + (row.business ?? "System"), kind: "Risk signal", href: "/admin/analytics" })),
        ...cases.map((row) => ({ id: row.id, title: row.title, detail: (row.business ?? "Business") + " · " + row.status, kind: "Investigation", href: "/admin/cases" })),
        ...admins.map((row) => ({ id: row.id, title: row.name, detail: row.staffId + " · " + row.role + " · " + (row.isActive ? "active" : "inactive") + " · " + row.email, kind: "Administrator", href: "/admin/settings#staff-management" })),
        ...tickets.map((row) => ({ id: row.id, title: row.subject, detail: (row.trader ?? "Trader") + " · " + row.status, kind: "Support ticket", href: "/admin/support?ticket=" + encodeURIComponent(row.id) })),
        ...auditEvents.map((row) => ({ id: row.id, title: row.action.replaceAll("_", " "), detail: (row.targetType ?? "Audit event") + (row.targetId ? " · " + row.targetId : ""), kind: "Audit", href: "/admin/audit" })),
      ],
      unavailableSources,
    };
  } catch (error) {
    logCommandCenterFailure("Super Admin command search failed", error);
    throw new Error("Command search is temporarily unavailable.");
  }
}
