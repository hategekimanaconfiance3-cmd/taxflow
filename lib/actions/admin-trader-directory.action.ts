"use server";

import { and, count, desc, eq, gte, ilike, inArray, isNotNull, lte, max, or, sql } from "drizzle-orm";
import db from "@/db/drizzle";
import tinDb from "@/db/tin-drizzle";
import { product, productionBatch, stock, transaction, user } from "@/db/schema";
import { tinRecord } from "@/db/tin-schema";
import { requireRRAOperationalPermission } from "@/lib/auth-guard";
import { hasOperationalRRAPermission, type RRAPermission, type RRARole } from "@/lib/rra-rbac";
import { logAudit } from "@/lib/audit";
import { traderDirectoryFilterSchema, type TraderDirectoryFilters } from "@/lib/validation/trader-filter.schema";
import { z } from "zod";

const PAGE_SIZE = 25;
const MAX_LOCATION_MATCHES = 5000;
const TRADER_ROLE_SQL = sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`;

type LocationField = "province" | "district" | "sector" | "cell" | "village";
type RolePermissionContext = { roles: string[]; has: (permission: RRAPermission) => boolean };

async function getDirectoryActor(): Promise<{ actorId: string; context: RolePermissionContext }> {
  const { user: actor, staff } = await requireRRAOperationalPermission("taxpayer.intelligence.search");
  const roles = staff.clearanceRoles as RRARole[];
  const has = (permission: RRAPermission) => hasOperationalRRAPermission(roles, permission);
  // Keep the existing separation between system administration and operational taxpayer access.
  if (!has("taxpayer.intelligence.search")) {
    throw new Error("Your current RRA role does not allow taxpayer directory access.");
  }
  return { actorId: actor.id, context: { roles, has } };
}

function locationConditions(filters: Pick<TraderDirectoryFilters, LocationField>) {
  const conditions = [];
  if (filters.province) conditions.push(eq(tinRecord.province, filters.province));
  if (filters.district) conditions.push(eq(tinRecord.district, filters.district));
  if (filters.sector) conditions.push(eq(tinRecord.sector, filters.sector));
  if (filters.cell) conditions.push(eq(tinRecord.cell, filters.cell));
  if (filters.village) conditions.push(eq(tinRecord.village, filters.village));
  return conditions;
}

function dateFrom(value?: string) {
  return value ? new Date(`${value}T00:00:00.000Z`) : undefined;
}

function dateTo(value?: string) {
  return value ? new Date(`${value}T23:59:59.999Z`) : undefined;
}

function activityDateFrom(filters: TraderDirectoryFilters) {
  const value = filters.activityFrom;
  return value ? new Date(`${value}T${filters.activityFromTime || "00:00"}:00.000Z`) : undefined;
}

function activityDateTo(filters: TraderDirectoryFilters) {
  const value = filters.activityTo;
  return value ? new Date(`${value}T${filters.activityToTime || "23:59"}:59.999Z`) : undefined;
}

async function recordDirectorySearch(actorId: string, filters: TraderDirectoryFilters, resultCount: number) {
  await logAudit({
    userId: actorId,
    action: "TAXPAYER_DIRECTORY_FILTER",
    targetType: "taxpayer_directory",
    metadata: {
      filtersUsed: Object.entries(filters).filter(([key, value]) => key !== "page" && Boolean(value)).map(([key]) => key),
      resultCount,
      page: filters.page,
    },
  });
}

async function emptyDirectoryResult(actorId: string, filters: TraderDirectoryFilters) {
  await recordDirectorySearch(actorId, filters, 0);
  return { total: 0, page: filters.page, pageSize: PAGE_SIZE, rows: [] };
}

async function getLocationTinNumbers(filters: TraderDirectoryFilters): Promise<string[] | undefined> {
  if (![filters.province, filters.district, filters.sector, filters.cell, filters.village].some(Boolean)) return undefined;
  const rows = await tinDb.select({ tinNumber: tinRecord.tinNumber })
    .from(tinRecord)
    .where(and(...locationConditions(filters)))
    .limit(MAX_LOCATION_MATCHES + 1);
  if (rows.length > MAX_LOCATION_MATCHES) {
    throw new Error("That location matches too many traders. Select a more specific district, sector, or cell.");
  }
  return rows.map((row) => row.tinNumber);
}

async function getMatchingProductIds(productSearch: string): Promise<string[]> {
  if (!productSearch) return [];
  const pattern = `%${productSearch}%`;
  const rows = await db.select({ id: product.id }).from(product)
    .where(or(ilike(product.name, pattern), ilike(product.categoryCode, pattern)))
    .limit(500);
  return rows.map((row) => row.id);
}

function buildActivityPredicate(
  filters: TraderDirectoryFilters,
  context: RolePermissionContext,
  productIds: string[],
): ReturnType<typeof sql> {
  const from = activityDateFrom(filters);
  const to = activityDateTo(filters);
  const productList = productIds.length ? sql`IN (${sql.join(productIds.map((id) => sql`${id}`), sql`, `)})` : null;
  const txnProductCondition = productList ? sql`AND txn.product_id ${productList}` : sql``;
  const stockProductCondition = productList ? sql`AND st.product_id ${productList}` : sql``;
  const txnFrom = from ? sql`AND txn.created_at >= ${from}` : sql``;
  const txnTo = to ? sql`AND txn.created_at <= ${to}` : sql``;
  const stockFrom = from ? sql`AND st.updated_at >= ${from}` : sql``;
  const stockTo = to ? sql`AND st.updated_at <= ${to}` : sql``;
  const checks = [];
  if (context.has("transaction.read")) {
    checks.push(sql`EXISTS (SELECT 1 FROM "transaction" AS txn WHERE (txn.seller_id = ${user.id} OR txn.buyer_id = ${user.id}) ${txnProductCondition} ${txnFrom} ${txnTo})`);
  }
  if (context.has("stock.read") || context.has("traceability.read")) {
    checks.push(sql`EXISTS (SELECT 1 FROM stock AS st WHERE st.business_id = ${user.id} ${stockProductCondition} ${stockFrom} ${stockTo})`);
  }
  if (context.has("traceability.read")) {
    const productionProductCondition = productList ? sql`AND pb.product_id ${productList}` : sql``;
    const productionFrom = from ? sql`AND pb.created_at >= ${from}` : sql``;
    const productionTo = to ? sql`AND pb.created_at <= ${to}` : sql``;
    checks.push(sql`EXISTS (SELECT 1 FROM production_batch AS pb WHERE pb.manufacturer_id = ${user.id} ${productionProductCondition} ${productionFrom} ${productionTo})`);
  }
  const activity = sql`(${sql.join(checks, sql` OR `)})`;
  return filters.noActivityDuringPeriod ? sql`NOT ${activity}` : activity;
}

const locationOptionsSchema = z.object({
  level: z.enum(["province", "district", "sector", "cell", "village"]),
  province: z.string().trim().max(100).optional(),
  district: z.string().trim().max(100).optional(),
  sector: z.string().trim().max(100).optional(),
  cell: z.string().trim().max(100).optional(),
});

export async function getTraderDirectoryFilterOptions(input: unknown) {
  const parsed = locationOptionsSchema.safeParse(input);
  if (!parsed.success) throw new Error("Select a valid location filter.");
  const { level } = parsed.data;
  if (level !== "province" && !parsed.data.province) throw new Error("Select a province first.");
  if (["sector", "cell", "village"].includes(level) && !parsed.data.district) throw new Error("Select a district first.");
  if (["cell", "village"].includes(level) && !parsed.data.sector) throw new Error("Select a sector first.");
  if (level === "village" && !parsed.data.cell) throw new Error("Select a cell first.");
  const { context } = await getDirectoryActor();
  if (!context.has("taxpayer.compliance.read")) {
    throw new Error("Your role does not allow taxpayer location filtering.");
  }

  const parentConditions = [];
  if (level !== "province" && parsed.data.province) parentConditions.push(eq(tinRecord.province, parsed.data.province));
  if (["sector", "cell", "village"].includes(level) && parsed.data.district) parentConditions.push(eq(tinRecord.district, parsed.data.district));
  if (["cell", "village"].includes(level) && parsed.data.sector) parentConditions.push(eq(tinRecord.sector, parsed.data.sector));
  if (level === "village" && parsed.data.cell) parentConditions.push(eq(tinRecord.cell, parsed.data.cell));
  const field = tinRecord[level];
  try {
    const rows = await tinDb.select({ value: field }).from(tinRecord)
      .where(and(isNotNull(field), ...parentConditions))
      .groupBy(field)
      .orderBy(field)
      .limit(500);
    return rows.map((row) => row.value).filter((value): value is string => Boolean(value));
  } catch (error) {
    console.error("Taxpayer location options query failed", { level, errorName: error instanceof Error ? error.name : typeof error });
    throw new Error("Taxpayer location options are temporarily unavailable.");
  }
}

export async function searchTraderDirectory(input: unknown) {
  const parsed = traderDirectoryFilterSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the selected filters and try again.");
  const filters = parsed.data;
  const { actorId, context } = await getDirectoryActor();

  const usesLocation = Boolean(filters.province || filters.district || filters.sector || filters.cell || filters.village);
  if (usesLocation && !context.has("taxpayer.compliance.read")) {
    throw new Error("Your role does not allow taxpayer location filtering.");
  }
  if (filters.activityFrom || filters.activityTo || filters.activityFromTime || filters.activityToTime || filters.product || filters.noActivityDuringPeriod) {
    if (!context.has("transaction.read") && !context.has("stock.read") && !context.has("traceability.read")) {
      throw new Error("Your role does not allow transaction or stock activity filtering.");
    }
  }
  const usesTransactionMetrics = [filters.minTransactions, filters.maxTransactions, filters.minSalesVolume, filters.maxSalesVolume, filters.minPurchaseVolume, filters.maxPurchaseVolume].some((value) => value !== undefined);
  if (usesTransactionMetrics && !context.has("transaction.read")) {
    throw new Error("Your role does not allow transaction volume filtering.");
  }
  const usesStockMetrics = filters.minStockQuantity !== undefined || filters.maxStockQuantity !== undefined;
  if (usesStockMetrics && !context.has("stock.read") && !context.has("traceability.read")) {
    throw new Error("Your role does not allow stock quantity filtering.");
  }
  if (usesStockMetrics && !filters.product) {
    throw new Error("Select one specific product before filtering its stock quantity.");
  }
  if (filters.riskLevel && !context.has("ai.findings.read")) {
    throw new Error("Your role does not allow risk indicator filtering.");
  }
  if (filters.relatedTraderTin && !context.has("transaction.read")) {
    throw new Error("Your role does not allow transaction relationship filtering.");
  }

  try {
    const conditions = [TRADER_ROLE_SQL];
    if (filters.query) {
      const pattern = `%${filters.query}%`;
      conditions.push(or(ilike(user.tinNumber, pattern), ilike(user.businessName, pattern), ilike(user.name, pattern))!);
    }
    if (filters.businessRole) conditions.push(eq(user.role, filters.businessRole));
    if (filters.businessType) conditions.push(eq(user.businessType, filters.businessType));
    if (filters.accountStatus) conditions.push(eq(user.isActive, filters.accountStatus === "active"));
    if (filters.clearanceStatus) conditions.push(eq(user.clearanceStatus, filters.clearanceStatus));
    if (filters.relatedTraderTin) {
      const [relatedTrader] = await db.select({ id: user.id }).from(user)
        .where(and(eq(user.tinNumber, filters.relatedTraderTin), TRADER_ROLE_SQL)).limit(1);
      if (!relatedTrader) return emptyDirectoryResult(actorId, filters);
      conditions.push(sql`EXISTS (SELECT 1 FROM "transaction" AS txn WHERE (txn.seller_id = ${user.id} AND txn.buyer_id = ${relatedTrader.id}) OR (txn.buyer_id = ${user.id} AND txn.seller_id = ${relatedTrader.id}))`);
    }
    const registeredFrom = dateFrom(filters.registeredFrom);
    const registeredTo = dateTo(filters.registeredTo);
    if (registeredFrom) conditions.push(gte(user.createdAt, registeredFrom));
    if (registeredTo) conditions.push(lte(user.createdAt, registeredTo));
    if (filters.minTransactions !== undefined) conditions.push(sql`(SELECT COUNT(*) FROM "transaction" AS txn WHERE txn.seller_id = ${user.id} OR txn.buyer_id = ${user.id}) >= ${filters.minTransactions}`);
    if (filters.maxTransactions !== undefined) conditions.push(sql`(SELECT COUNT(*) FROM "transaction" AS txn WHERE txn.seller_id = ${user.id} OR txn.buyer_id = ${user.id}) <= ${filters.maxTransactions}`);
    if (filters.minSalesVolume !== undefined) conditions.push(sql`(SELECT COALESCE(SUM(txn.total_amount), 0) FROM "transaction" AS txn WHERE txn.seller_id = ${user.id}) >= ${filters.minSalesVolume}`);
    if (filters.maxSalesVolume !== undefined) conditions.push(sql`(SELECT COALESCE(SUM(txn.total_amount), 0) FROM "transaction" AS txn WHERE txn.seller_id = ${user.id}) <= ${filters.maxSalesVolume}`);
    if (filters.minPurchaseVolume !== undefined) conditions.push(sql`(SELECT COALESCE(SUM(txn.total_amount), 0) FROM "transaction" AS txn WHERE txn.buyer_id = ${user.id}) >= ${filters.minPurchaseVolume}`);
    if (filters.maxPurchaseVolume !== undefined) conditions.push(sql`(SELECT COALESCE(SUM(txn.total_amount), 0) FROM "transaction" AS txn WHERE txn.buyer_id = ${user.id}) <= ${filters.maxPurchaseVolume}`);
    if (filters.riskLevel) conditions.push(sql`(SELECT ra.risk_level FROM risk_assessment AS ra WHERE ra.business_id = ${user.id} ORDER BY ra.assessment_date DESC, ra.created_at DESC, ra.id DESC LIMIT 1) = ${filters.riskLevel}`);

    const locationTins = await getLocationTinNumbers(filters);
    if (locationTins && locationTins.length === 0) {
      return emptyDirectoryResult(actorId, filters);
    }
    if (locationTins) conditions.push(inArray(user.tinNumber, locationTins));

    let productIds: string[] = [];
    if (filters.product) {
      productIds = await getMatchingProductIds(filters.product);
      if (!productIds.length) return emptyDirectoryResult(actorId, filters);
    }
    if (usesStockMetrics) {
      if (productIds.length !== 1) throw new Error("Use a product search that matches one product before filtering stock quantity.");
      if (filters.minStockQuantity !== undefined) conditions.push(sql`(SELECT COALESCE(SUM(st.quantity), 0) FROM stock AS st WHERE st.business_id = ${user.id} AND st.product_id = ${productIds[0]}) >= ${filters.minStockQuantity}`);
      if (filters.maxStockQuantity !== undefined) conditions.push(sql`(SELECT COALESCE(SUM(st.quantity), 0) FROM stock AS st WHERE st.business_id = ${user.id} AND st.product_id = ${productIds[0]}) <= ${filters.maxStockQuantity}`);
    }

    if (filters.activityFrom || filters.activityTo || filters.activityFromTime || filters.activityToTime || filters.product || filters.noActivityDuringPeriod) {
      conditions.push(buildActivityPredicate(filters, context, productIds));
    }

    const where = and(...conditions);
    const [totalRow] = await db.select({ value: count() }).from(user).where(where);
    const offset = (filters.page - 1) * PAGE_SIZE;
    const traders = await db.select({
      id: user.id,
      name: user.name,
      businessName: user.businessName,
      tinNumber: user.tinNumber,
      businessRole: user.role,
      businessType: user.businessType,
      accountActive: user.isActive,
      clearanceStatus: user.clearanceStatus,
      accountCreatedAt: user.createdAt,
      updatedAt: user.updatedAt,
      riskLevel: context.has("ai.findings.read")
        ? sql<string | null>`(SELECT ra.risk_level FROM risk_assessment AS ra WHERE ra.business_id = ${user.id} ORDER BY ra.assessment_date DESC, ra.created_at DESC, ra.id DESC LIMIT 1)`
        : sql<string | null>`NULL`,
    }).from(user).where(where).orderBy(desc(user.createdAt)).limit(PAGE_SIZE).offset(offset);

    const traderIds = traders.map((trader) => trader.id);
    const traderTins = traders.map((trader) => trader.tinNumber).filter((value): value is string => Boolean(value));
    const [locationRows, transactionSales, transactionPurchases, stockActivity, stockProducts, productionActivity, productSales, productStock, productProduction] = await Promise.all([
      context.has("taxpayer.compliance.read") && traderTins.length
        ? tinDb.select({ tinNumber: tinRecord.tinNumber, province: tinRecord.province, district: tinRecord.district, sector: tinRecord.sector, cell: tinRecord.cell, village: tinRecord.village })
          .from(tinRecord).where(inArray(tinRecord.tinNumber, traderTins))
        : Promise.resolve([]),
      context.has("transaction.read") && traderIds.length
        ? db.select({ traderId: transaction.sellerId, lastActivityAt: max(transaction.createdAt), transactionCount: count(), salesVolume: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8` })
          .from(transaction).where(inArray(transaction.sellerId, traderIds)).groupBy(transaction.sellerId)
        : Promise.resolve([]),
      context.has("transaction.read") && traderIds.length
        ? db.select({ traderId: transaction.buyerId, lastActivityAt: max(transaction.createdAt), transactionCount: count(), purchaseVolume: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8` })
          .from(transaction).where(and(inArray(transaction.buyerId, traderIds), isNotNull(transaction.buyerId))).groupBy(transaction.buyerId)
        : Promise.resolve([]),
      (context.has("stock.read") || context.has("traceability.read")) && traderIds.length
        ? db.select({ traderId: stock.businessId, lastActivityAt: max(stock.updatedAt) })
          .from(stock).where(inArray(stock.businessId, traderIds)).groupBy(stock.businessId)
        : Promise.resolve([]),
      (context.has("stock.read") || context.has("traceability.read")) && traderIds.length
        ? db.select({ traderId: stock.businessId, productName: product.name, unit: product.unit, quantity: stock.quantity })
          .from(stock).innerJoin(product, eq(stock.productId, product.id)).where(inArray(stock.businessId, traderIds)).orderBy(stock.businessId, product.name).limit(5000)
        : Promise.resolve([]),
      context.has("traceability.read") && traderIds.length
        ? db.select({ traderId: productionBatch.manufacturerId, lastActivityAt: max(productionBatch.createdAt), batchCount: count(), productionQuantity: sql<number>`COALESCE(SUM(${productionBatch.declaredQuantity}), 0)::float8` })
          .from(productionBatch).where(inArray(productionBatch.manufacturerId, traderIds)).groupBy(productionBatch.manufacturerId)
        : Promise.resolve([]),
      productIds.length && (context.has("transaction.read") || context.has("stock.read") || context.has("traceability.read")) && traderIds.length
        ? db.select({ sellerId: transaction.sellerId, buyerId: transaction.buyerId, productName: product.name })
          .from(transaction).innerJoin(product, eq(transaction.productId, product.id))
          .where(and(or(inArray(transaction.sellerId, traderIds), inArray(transaction.buyerId, traderIds)), inArray(transaction.productId, productIds))).groupBy(transaction.sellerId, transaction.buyerId, product.name)
        : Promise.resolve([]),
      productIds.length && (context.has("stock.read") || context.has("traceability.read")) && traderIds.length
        ? db.select({ traderId: stock.businessId, productName: product.name }).from(stock)
          .innerJoin(product, eq(stock.productId, product.id))
          .where(and(inArray(stock.businessId, traderIds), inArray(stock.productId, productIds))).groupBy(stock.businessId, product.name)
        : Promise.resolve([]),
      productIds.length && context.has("traceability.read") && traderIds.length
        ? db.select({ traderId: productionBatch.manufacturerId, productName: product.name }).from(productionBatch)
          .innerJoin(product, eq(productionBatch.productId, product.id))
          .where(and(inArray(productionBatch.manufacturerId, traderIds), inArray(productionBatch.productId, productIds))).groupBy(productionBatch.manufacturerId, product.name)
        : Promise.resolve([]),
    ]);
    const locationByTin = new Map(locationRows.map((row) => [row.tinNumber, row]));
    const transactionByTrader = new Map<string, { transactionCount: number; salesVolume: number; purchaseVolume: number; lastActivityAt: Date | null }>();
    for (const row of transactionSales) transactionByTrader.set(row.traderId, {
      transactionCount: Number(row.transactionCount), salesVolume: Number(row.salesVolume), purchaseVolume: 0, lastActivityAt: row.lastActivityAt,
    });
    for (const row of transactionPurchases) {
      if (!row.traderId) continue;
      const current = transactionByTrader.get(row.traderId) ?? { transactionCount: 0, salesVolume: 0, purchaseVolume: 0, lastActivityAt: null };
      current.transactionCount += Number(row.transactionCount);
      current.purchaseVolume = Number(row.purchaseVolume);
      if (row.lastActivityAt && (!current.lastActivityAt || row.lastActivityAt > current.lastActivityAt)) current.lastActivityAt = row.lastActivityAt;
      transactionByTrader.set(row.traderId, current);
    }
    const stockByTrader = new Map(stockActivity.map((row) => [row.traderId, row]));
    const stockByProduct = new Map<string, Array<{ productName: string; unit: string; quantity: number }>>();
    for (const row of stockProducts) stockByProduct.set(row.traderId, [...(stockByProduct.get(row.traderId) ?? []), { productName: row.productName, unit: row.unit, quantity: row.quantity }]);
    const productsByTrader = new Map<string, string[]>();
    for (const row of productSales) {
      productsByTrader.set(row.sellerId, [...(productsByTrader.get(row.sellerId) ?? []), row.productName]);
      if (row.buyerId) productsByTrader.set(row.buyerId, [...(productsByTrader.get(row.buyerId) ?? []), row.productName]);
    }
    for (const row of productStock) productsByTrader.set(row.traderId, [...(productsByTrader.get(row.traderId) ?? []), row.productName]);
    for (const row of productProduction) productsByTrader.set(row.traderId, [...(productsByTrader.get(row.traderId) ?? []), row.productName]);

    const rows = traders.map((trader) => {
      const txn = transactionByTrader.get(trader.id);
      const stockRow = stockByTrader.get(trader.id);
      const productionRow = productionActivity.find((activity) => activity.traderId === trader.id);
      const activityDates = [txn?.lastActivityAt, stockRow?.lastActivityAt, productionRow?.lastActivityAt].filter((value): value is Date => value instanceof Date);
      const location = trader.tinNumber ? locationByTin.get(trader.tinNumber) : undefined;
      return {
        ...trader,
        ...(context.has("taxpayer.compliance.read") && location ? { location: { province: location.province, district: location.district, sector: location.sector, cell: location.cell, village: location.village } } : {}),
        ...(context.has("transaction.read") ? { transactionCount: Number(txn?.transactionCount ?? 0), salesVolume: Number(txn?.salesVolume ?? 0), purchaseVolume: Number(txn?.purchaseVolume ?? 0) } : {}),
        ...((context.has("stock.read") || context.has("traceability.read")) ? { stockSummary: stockByProduct.get(trader.id) ?? [] } : {}),
        ...(context.has("traceability.read") ? { productionBatchCount: Number(productionRow?.batchCount ?? 0), productionQuantity: Number(productionRow?.productionQuantity ?? 0) } : {}),
        ...(context.has("transaction.read") || context.has("stock.read") || context.has("traceability.read") ? { lastActivityAt: activityDates.sort((a, b) => b.getTime() - a.getTime())[0] ?? null } : {}),
        ...(filters.product ? { matchingProducts: productsByTrader.get(trader.id) ?? [] } : {}),
        ...(context.has("ai.findings.read") ? { riskLevel: trader.riskLevel } : {}),
      };
    });

    await recordDirectorySearch(actorId, filters, Number(totalRow?.value ?? 0));

    return { total: Number(totalRow?.value ?? 0), page: filters.page, pageSize: PAGE_SIZE, rows };
  } catch (error) {
    if (error instanceof Error && ["That location", "Your role", "Select one specific product", "Use a product search"].some((prefix) => error.message.startsWith(prefix))) throw error;
    console.error("Trader directory search failed", { actorId, errorName: error instanceof Error ? error.name : typeof error });
    throw new Error("Trader search is temporarily unavailable. Please adjust filters or try again.");
  }
}
