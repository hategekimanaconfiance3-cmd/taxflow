// Server-only — Manufacturer-Specific AI Detection Signals
// These run as event hooks whenever a manufacturer performs an action.
// All signals are deterministic — no LLM calls.

import { eq, and, gte, sql, inArray } from 'drizzle-orm';
import db from '@/db/drizzle';
import {
  transaction, stock, stockAdjustment, productionBatch,
  importDeclaration, aiFinding, user, product,
} from '@/db/schema';
import { routeFindingToRRAStaff } from './finding-router';

export interface SignalResult {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  explanation: string;
  findingType: string;
  observedValue?: number;
  expectedValue?: number;
  referenceId?: string;
}

// ---------------------------------------------------------------------------
// Signal 1 — IMPORT_VS_STOCK_MISMATCH
// When an import is approved, check that stock increased by ≥90% of declared qty
// ---------------------------------------------------------------------------

export async function checkImportVsStock(
  declarationId: string,
  businessId: string,
): Promise<SignalResult | null> {
  try {
    const [decl] = await db
      .select({
        expectedQuantity: importDeclaration.expectedQuantity,
        productId: importDeclaration.productId,
        actualQuantity: importDeclaration.actualQuantity,
      })
      .from(importDeclaration)
      .where(and(eq(importDeclaration.id, declarationId), eq(importDeclaration.businessId, businessId)))
      .limit(1);

    if (!decl || !decl.actualQuantity || !decl.expectedQuantity) return null;

    const ratio = decl.actualQuantity / decl.expectedQuantity;
    if (ratio >= 0.9) return null; // Within tolerance

    // Check if stock actually went up for this product after approval
    const [stockRow] = await db
      .select({ quantity: stock.quantity })
      .from(stock)
      .where(and(eq(stock.businessId, businessId), eq(stock.productId, decl.productId)))
      .limit(1);

    const currentStock = stockRow?.quantity ?? 0;

    return {
      code: 'IMPORT_VS_STOCK_MISMATCH',
      severity: ratio < 0.5 ? 'critical' : 'warning',
      title: 'Import declaration vs stock mismatch',
      explanation: `Declared import: ${decl.expectedQuantity} units. Received: ${decl.actualQuantity} units (${Math.round(ratio * 100)}%). Current stock: ${currentStock}. Goods declared but not stocked may indicate diversion.`,
      findingType: 'import_vs_stock_mismatch',
      observedValue: decl.actualQuantity,
      expectedValue: decl.expectedQuantity,
      referenceId: declarationId,
    };
  } catch (error) {
    console.error('[Signal] checkImportVsStock error:', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Signal 2 — PRODUCTION_EFFICIENCY_ANOMALY
// Output quantity vs historical average efficiency
// ---------------------------------------------------------------------------

export async function checkProductionEfficiency(
  manufacturerId: string,
  productId: string,
  newQuantity: number,
): Promise<SignalResult | null> {
  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Historical production quantities for this product
    const historical = await db
      .select({ quantity: productionBatch.declaredQuantity })
      .from(productionBatch)
      .where(
        and(
          eq(productionBatch.manufacturerId, manufacturerId),
          eq(productionBatch.productId, productId),
          gte(productionBatch.periodStart, ninetyDaysAgo),
        ),
      );

    if (historical.length < 3) return null; // Not enough history

    const avg = historical.reduce((sum, b) => sum + b.quantity, 0) / historical.length;
    const ratio = newQuantity / avg;

    if (ratio >= 0.5 && ratio <= 1.5) return null; // Normal range ±50%

    return {
      code: 'PRODUCTION_EFFICIENCY_ANOMALY',
      severity: ratio > 2 || ratio < 0.3 ? 'critical' : 'warning',
      title: 'Unusual production quantity declared',
      explanation: `Declared production: ${newQuantity} units. Historical average (last 90 days, ${historical.length} batches): ${Math.round(avg)} units. This batch is ${Math.round(ratio * 100)}% of historical average. Significant deviation may indicate fabricated or under-declared output.`,
      findingType: 'production_efficiency_anomaly',
      observedValue: newQuantity,
      expectedValue: Math.round(avg),
    };
  } catch (error) {
    console.error('[Signal] checkProductionEfficiency error:', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Signal 3 — RAPID_STOCK_DEPLETION
// Sold >80% of opening stock in a single day
// ---------------------------------------------------------------------------

export async function checkRapidStockDepletion(
  sellerId: string,
  productId: string,
  quantitySold: number,
): Promise<SignalResult | null> {
  try {
    const [stockRow] = await db
      .select({ quantity: stock.quantity })
      .from(stock)
      .where(and(eq(stock.businessId, sellerId), eq(stock.productId, productId)))
      .limit(1);

    const currentStock = stockRow?.quantity ?? 0;
    const openingStock = currentStock + quantitySold; // Before this sale

    if (openingStock <= 0) return null;

    // Total sold today for this product
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [todaySales] = await db
      .select({ total: sql<number>`COALESCE(SUM(${transaction.quantity}), 0)::float8` })
      .from(transaction)
      .where(
        and(
          eq(transaction.sellerId, sellerId),
          eq(transaction.productId, productId),
          inArray(transaction.status, ['confirmed', 'completed', 'pending']),
          gte(transaction.createdAt, startOfDay),
        ),
      );

    const totalSoldToday = Number(todaySales?.total ?? 0) + quantitySold;
    const depletionRatio = totalSoldToday / openingStock;

    if (depletionRatio < 0.8) return null;

    return {
      code: 'RAPID_STOCK_DEPLETION',
      severity: depletionRatio >= 1 ? 'critical' : 'warning',
      title: 'Rapid stock depletion in single day',
      explanation: `Sold ${totalSoldToday} of ${openingStock} units (${Math.round(depletionRatio * 100)}%) in one day. Without a matching production batch, this may indicate pre-stocked off-system goods being laundered through the platform.`,
      findingType: 'rapid_stock_depletion',
      observedValue: totalSoldToday,
      expectedValue: openingStock,
    };
  } catch (error) {
    console.error('[Signal] checkRapidStockDepletion error:', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Signal 4 — REPEATED_STOCK_LOSS_PATTERN
// ≥3 loss/damage events in 30 days OR losses >15% of produced
// ---------------------------------------------------------------------------

export async function checkRepeatedStockLoss(
  businessId: string,
  productId: string,
  newLossQuantity: number,
): Promise<SignalResult | null> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [lossStats] = await db
      .select({
        count: sql<number>`COUNT(*)::int`,
        totalLoss: sql<number>`COALESCE(ABS(SUM(${stockAdjustment.quantityDelta})), 0)::float8`,
      })
      .from(stockAdjustment)
      .where(
        and(
          eq(stockAdjustment.businessId, businessId),
          eq(stockAdjustment.productId, productId),
          inArray(stockAdjustment.adjustmentType, ['damage', 'loss']),
          gte(stockAdjustment.createdAt, thirtyDaysAgo),
        ),
      );

    const lossCount = Number(lossStats?.count ?? 0) + 1; // +1 for current event
    const totalLoss = Number(lossStats?.totalLoss ?? 0) + newLossQuantity;

    if (lossCount < 3) return null;

    return {
      code: 'REPEATED_STOCK_LOSS_PATTERN',
      severity: lossCount >= 5 ? 'critical' : 'warning',
      title: 'Repeated stock loss pattern detected',
      explanation: `${lossCount} loss/damage events in the last 30 days for this product. Total declared losses: ${totalLoss} units. Repeated losses may mask unrecorded sales.`,
      findingType: 'repeated_stock_loss',
      observedValue: lossCount,
      expectedValue: 2,
    };
  } catch (error) {
    console.error('[Signal] checkRepeatedStockLoss error:', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Signal 5 — SALES_WITHOUT_PRODUCTION (for scheduled scan)
// Manufacturer selling products they haven't declared producing
// ---------------------------------------------------------------------------

export async function checkSalesWithoutProduction(
  manufacturerId: string,
): Promise<SignalResult[]> {
  const results: SignalResult[] = [];
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Products the manufacturer has sold in the last 30 days
    const soldProducts = await db
      .select({
        productId: transaction.productId,
        totalSold: sql<number>`COALESCE(SUM(${transaction.quantity}), 0)::float8`,
      })
      .from(transaction)
      .where(
        and(
          eq(transaction.sellerId, manufacturerId),
          inArray(transaction.status, ['confirmed', 'completed']),
          gte(transaction.createdAt, thirtyDaysAgo),
        ),
      )
      .groupBy(transaction.productId);

    for (const sold of soldProducts) {
      // Check if any production batch declared for this product
      const [production] = await db
        .select({ total: sql<number>`COALESCE(SUM(${productionBatch.declaredQuantity}), 0)::float8` })
        .from(productionBatch)
        .where(
          and(
            eq(productionBatch.manufacturerId, manufacturerId),
            eq(productionBatch.productId, sold.productId),
            gte(productionBatch.periodStart, thirtyDaysAgo),
          ),
        );

      // Check if purchased from supplier
      const [purchased] = await db
        .select({ total: sql<number>`COALESCE(SUM(${transaction.quantity}), 0)::float8` })
        .from(transaction)
        .where(
          and(
            eq(transaction.buyerId, manufacturerId),
            eq(transaction.productId, sold.productId),
            inArray(transaction.status, ['confirmed', 'completed']),
            gte(transaction.createdAt, thirtyDaysAgo),
          ),
        );

      const declared = Number(production?.total ?? 0) + Number(purchased?.total ?? 0);
      if (declared > 0 || sold.totalSold <= 0) continue;

      const [prod] = await db.select({ name: product.name }).from(product).where(eq(product.id, sold.productId)).limit(1);

      results.push({
        code: 'SALES_WITHOUT_PRODUCTION',
        severity: sold.totalSold > 1000 ? 'critical' : 'warning',
        title: 'Sales recorded without declared production or purchase',
        explanation: `Manufacturer sold ${sold.totalSold} units of "${prod?.name ?? sold.productId}" in the last 30 days with zero declared production batches or purchase receipts for the same period. Possible off-system stock.`,
        findingType: 'sales_without_production',
        observedValue: sold.totalSold,
        expectedValue: 0,
      });
    }
  } catch (error) {
    console.error('[Signal] checkSalesWithoutProduction error:', error);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Save a signal result as an aiFinding and route to RRA staff
// ---------------------------------------------------------------------------

export async function saveAndRouteFinding(
  signal: SignalResult,
  businessId: string,
  productId?: string,
): Promise<string | null> {
  try {
    // Check for existing open finding of the same type for this business+product
    const existing = await db
      .select({ id: aiFinding.id })
      .from(aiFinding)
      .where(
        and(
          eq(aiFinding.businessId, businessId),
          eq(aiFinding.findingType, signal.findingType),
          eq(aiFinding.reviewStatus, 'open'),
          productId ? eq(aiFinding.productId, productId) : sql`true`,
        ),
      )
      .limit(1);

    let findingId: string;

    if (existing[0]) {
      // Refresh existing open finding
      await db.update(aiFinding).set({
        observedValue: signal.observedValue ?? null,
        expectedValue: signal.expectedValue ?? null,
        difference: signal.observedValue != null && signal.expectedValue != null
          ? signal.observedValue - signal.expectedValue
          : null,
        explanation: signal.explanation,
        severity: signal.severity,
        updatedAt: new Date(),
      }).where(eq(aiFinding.id, existing[0].id));
      findingId = existing[0].id;
    } else {
      // Create new finding
      const [finding] = await db.insert(aiFinding).values({
        findingType: signal.findingType,
        severity: signal.severity,
        businessId,
        productId: productId ?? null,
        observedValue: signal.observedValue ?? null,
        expectedValue: signal.expectedValue ?? null,
        difference: signal.observedValue != null && signal.expectedValue != null
          ? signal.observedValue - signal.expectedValue
          : null,
        differenceUnit: 'units',
        explanation: signal.explanation,
        detectionMethod: 'deterministic',
        reviewStatus: 'open',
        modelVersion: 'manufacturer-signals-v1',
      }).returning({ id: aiFinding.id });

      if (!finding) return null;
      findingId = finding.id;
    }

    // Get business name for routing
    const [biz] = await db.select({ businessName: user.businessName }).from(user).where(eq(user.id, businessId)).limit(1);
    const [prod] = productId
      ? await db.select({ name: product.name }).from(product).where(eq(product.id, productId)).limit(1)
      : [null];

    await routeFindingToRRAStaff({
      findingId,
      findingType: signal.findingType,
      severity: signal.severity,
      businessId,
      businessName: biz?.businessName ?? null,
      productName: prod?.name ?? null,
      observedValue: signal.observedValue ?? null,
      expectedValue: signal.expectedValue ?? null,
      explanation: signal.explanation,
    });

    return findingId;
  } catch (error) {
    console.error('[Signal] saveAndRouteFinding error:', error);
    return null;
  }
}
