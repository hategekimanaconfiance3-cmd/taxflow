"use server";

import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { ilike, or } from "drizzle-orm";
import { z } from "zod";
import db from "@/db/drizzle";
import { aiFinding, product, productionBatch, rraCase, stock, stockMovement, transaction, user } from "@/db/schema";
import { getDashboardOverview } from "@/lib/actions/admin-dashboard.action";
import { requireRRASession } from "@/lib/auth-guard";
import { parseSuperAdminDashboardFilters, resolveSuperAdminComparisonRange, resolveSuperAdminDashboardRange } from "@/lib/super-admin-command-center";

export async function getSuperAdminCommandCenter(input: unknown) {
  const parsed = parseSuperAdminDashboardFilters(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Choose a valid dashboard period.");
  await requireRRASession("super_admin");
  const now = new Date();
  const range = resolveSuperAdminDashboardRange(parsed.data, now);
  const comparison = resolveSuperAdminComparisonRange(range, parsed.data.comparison);
  const cutoff5 = new Date(now.getTime() - 5 * 60_000);
  const cutoff15 = new Date(now.getTime() - 15 * 60_000);
  const cutoff60 = new Date(now.getTime() - 60 * 60_000);
  const chartBucket = parsed.data.period === "today" ? "hour" : "day";

  try {
    const [overview, activeBusinesses, findings, quality, stockSnapshot, movements, production, latestSources, selectedValue, priorValue, recentActivity, seriesRows, rankedBusinesses] = await Promise.all([
      getDashboardOverview(range.from, range.to),
      db.select({ count: sql<number>`COUNT(*)::int` }).from(user)
        .where(and(inArray(user.role, ["manufacturer", "wholesaler", "retailer"]), eq(user.isActive, true))),
      db.select({ id: aiFinding.id, type: aiFinding.findingType, severity: aiFinding.severity, status: aiFinding.reviewStatus, reason: aiFinding.explanation, observed: aiFinding.observedValue, expected: aiFinding.expectedValue, evidence: aiFinding.evidenceRefs, at: aiFinding.createdAt, businessId: aiFinding.businessId, business: user.businessName, tin: user.tinNumber, productId: aiFinding.productId })
        .from(aiFinding).leftJoin(user, eq(aiFinding.businessId, user.id))
        .where(and(inArray(aiFinding.reviewStatus, ["open", "under_review", "pending"]), gte(aiFinding.createdAt, range.from), lte(aiFinding.createdAt, range.to)))
        .orderBy(desc(aiFinding.createdAt)).limit(10),
      db.select({ count: sql<number>`COUNT(*)::int` }).from(aiFinding)
        .where(and(eq(aiFinding.findingType, "data_quality"), inArray(aiFinding.reviewStatus, ["open", "under_review", "pending"]))),
      db.select({ units: sql<number>`COALESCE(SUM(${stock.quantity}),0)::float8`, businesses: sql<number>`COUNT(DISTINCT ${stock.businessId})::int` }).from(stock),
      db.select({ businessId: user.id, business: user.businessName, productId: stockMovement.productId, delta: sql<number>`COALESCE(SUM(${stockMovement.quantityDelta}),0)::float8`, count: sql<number>`COUNT(*)::int` })
        .from(stockMovement).innerJoin(user, eq(stockMovement.businessId, user.id))
        .where(and(gte(stockMovement.createdAt, range.from), lte(stockMovement.createdAt, range.to)))
        .groupBy(user.id, user.businessName, stockMovement.productId)
        .orderBy(desc(sql`ABS(COALESCE(SUM(${stockMovement.quantityDelta}),0))`)).limit(8),
      db.select({ batches: sql<number>`COUNT(*)::int`, units: sql<number>`COALESCE(SUM(${productionBatch.declaredQuantity}),0)::float8` }).from(productionBatch)
        .where(and(gte(productionBatch.createdAt, range.from), lte(productionBatch.createdAt, range.to))),
      Promise.all([
        db.select({ at: sql<Date | null>`MAX(${transaction.createdAt})` }).from(transaction),
        db.select({ at: sql<Date | null>`MAX(${aiFinding.createdAt})` }).from(aiFinding),
      ]),
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
      sourceFreshness: latestSources.map((rows) => rows[0]?.at ? new Date(rows[0].at).toISOString() : null),
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
      risks: findings.map((row) => ({
        id: row.id, type: row.type, severity: row.severity, status: row.status ?? "open", reason: row.reason,
        observed: row.observed, expected: row.expected, evidence: parseEvidence(row.evidence), at: row.at.toISOString(),
        businessId: row.businessId, business: row.business ?? "System-level signal", tin: row.tin, productId: row.productId,
      })),
      dataQuality: Number(quality[0]?.count ?? 0),
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
  if (!parsed.success) return [];
  await requireRRASession("super_admin");
  const query = "%" + parsed.data + "%";
  try {
    const [businesses, productsFound, transactionsFound, findings, cases] = await Promise.all([
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
    ]);
    return [
      ...businesses.map((row) => ({ id: row.id, title: row.name ?? row.tin ?? "Business", detail: row.role + " · TIN " + (row.tin ?? "unavailable"), kind: "Business", href: "/admin/traders/" + row.id })),
      ...productsFound.map((row) => ({ id: row.id, title: row.name, detail: row.category ?? "Product", kind: "Product", href: "/admin/product-journey?productId=" + encodeURIComponent(row.id) })),
      ...transactionsFound.map((row) => ({ id: row.id, title: row.id, detail: (row.business ?? "Business") + " · " + row.item + " · " + row.status, kind: "Transaction", href: "/admin/transactions" })),
      ...findings.map((row) => ({ id: row.id, title: row.type.replaceAll("_", " "), detail: row.severity + " · " + (row.business ?? "System"), kind: "Risk signal", href: "/admin/analytics" })),
      ...cases.map((row) => ({ id: row.id, title: row.title, detail: (row.business ?? "Business") + " · " + row.status, kind: "Investigation", href: "/admin/cases" })),
    ];
  } catch (error) {
    logCommandCenterFailure("Super Admin command search failed", error);
    throw new Error("Command search is temporarily unavailable.");
  }
}
