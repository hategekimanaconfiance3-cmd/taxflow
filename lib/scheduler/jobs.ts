// Server-only — Scheduled background jobs for TaxFlow AI monitoring
// Started once from server.ts when the HTTP server boots.
// Jobs run on a fixed interval using setInterval — no external queue needed.
// IMPORTANT: All jobs must be fully self-contained and never throw to the
//            top-level (the caller). Errors are logged and swallowed.

import { eq, and, gte, sql, inArray } from 'drizzle-orm';
import db from '@/db/drizzle';
import {
  user, transaction, productionBatch, stock, stockAdjustment,
  aiFinding, importDeclaration, stockMovement,
} from '@/db/schema';
import { saveAndRouteFinding } from '@/lib/ai/manufacturer-signals';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Job 1 — Quick Scan (every 15 minutes)
// Checks for rapid stock depletion events in the last 30 minutes
// ---------------------------------------------------------------------------

async function runQuickScan(): Promise<void> {
  try {
    const since = new Date(Date.now() - 30 * 60 * 1000); // last 30 min

    // Find all recent sale movements
    const recentSales = await db
      .select({
        businessId: stockMovement.businessId,
        productId: stockMovement.productId,
        quantityDelta: stockMovement.quantityDelta,
        quantityBefore: stockMovement.quantityBefore,
      })
      .from(stockMovement)
      .where(
        and(
          eq(stockMovement.movementType, 'sale'),
          gte(stockMovement.createdAt, since),
        ),
      )
      .limit(500);

    for (const mv of recentSales) {
      if (!mv.quantityBefore || mv.quantityBefore <= 0) continue;
      const depleted = Math.abs(mv.quantityDelta) / mv.quantityBefore;
      if (depleted < 0.8) continue;

      await saveAndRouteFinding(
        {
          code: 'RAPID_STOCK_DEPLETION',
          severity: depleted >= 0.95 ? 'critical' : 'warning',
          title: 'Rapid stock depletion detected',
          explanation: `Stock for product dropped by ${Math.round(depleted * 100)}% (${Math.abs(mv.quantityDelta)} units sold) in a single transaction. Opening stock: ${mv.quantityBefore} units. Possible bulk off-system diversion.`,
          findingType: 'rapid_stock_depletion',
          observedValue: Math.abs(mv.quantityDelta),
          expectedValue: mv.quantityBefore,
        },
        mv.businessId,
        mv.productId ?? undefined,
      );
    }
  } catch (err) {
    console.error('[Scheduler:QuickScan] Error:', err);
  }
}

// ---------------------------------------------------------------------------
// Job 2 — Hourly Scan (every 1 hour)
// Checks for sales without matching production or purchases
// ---------------------------------------------------------------------------

async function runHourlyScan(): Promise<void> {
  try {
    const thirtyDaysAgo = daysAgo(30);

    // All manufacturers with sales in last 30 days
    const salesByManufacturer = await db
      .select({
        businessId: transaction.sellerId,
        productId: transaction.productId,
        totalSold: sql<number>`COALESCE(SUM(${transaction.quantity}), 0)::float8`,
      })
      .from(transaction)
      .where(
        and(
          inArray(transaction.status, ['confirmed', 'completed']),
          gte(transaction.createdAt, thirtyDaysAgo),
        ),
      )
      .groupBy(transaction.sellerId, transaction.productId)
      .having(sql`SUM(${transaction.quantity}) > 0`)
      .limit(500);

    for (const sold of salesByManufacturer) {
      if (!sold.businessId) continue;

      // Check seller is a manufacturer
      const [biz] = await db
        .select({ role: user.role })
        .from(user)
        .where(eq(user.id, sold.businessId))
        .limit(1);
      if (!biz || biz.role !== 'manufacturer') continue;

      // Check production in period
      const [production] = await db
        .select({ total: sql<number>`COALESCE(SUM(${productionBatch.declaredQuantity}), 0)::float8` })
        .from(productionBatch)
        .where(
          and(
            eq(productionBatch.manufacturerId, sold.businessId),
            eq(productionBatch.productId, sold.productId),
            gte(productionBatch.periodStart, thirtyDaysAgo),
          ),
        );

      // Check purchases in period
      const [purchased] = await db
        .select({ total: sql<number>`COALESCE(SUM(${transaction.quantity}), 0)::float8` })
        .from(transaction)
        .where(
          and(
            eq(transaction.buyerId, sold.businessId),
            eq(transaction.productId, sold.productId),
            inArray(transaction.status, ['confirmed', 'completed']),
            gte(transaction.createdAt, thirtyDaysAgo),
          ),
        );

      const declared = Number(production?.total ?? 0) + Number(purchased?.total ?? 0);
      if (declared > 0) continue; // Has legitimate source

      await saveAndRouteFinding(
        {
          code: 'SALES_WITHOUT_PRODUCTION',
          severity: sold.totalSold > 1000 ? 'critical' : 'warning',
          title: 'Sales recorded without declared production or purchase',
          explanation: `Manufacturer sold ${sold.totalSold} units in the last 30 days with zero declared production batches or confirmed purchases for the same product and period. Possible off-system stock.`,
          findingType: 'sales_without_production',
          observedValue: sold.totalSold,
          expectedValue: 0,
        },
        sold.businessId,
        sold.productId ?? undefined,
      );
    }
  } catch (err) {
    console.error('[Scheduler:HourlyScan] Error:', err);
  }
}

// ---------------------------------------------------------------------------
// Job 3 — Six-Hour Scan
// Checks for repeated stock loss patterns (≥3 loss events in 30 days)
// ---------------------------------------------------------------------------

async function runSixHourScan(): Promise<void> {
  try {
    const thirtyDaysAgo = daysAgo(30);

    // Count stock loss adjustments per business+product
    const lossGroups = await db
      .select({
        businessId: stockAdjustment.businessId,
        productId: stockAdjustment.productId,
        lossCount: sql<number>`COUNT(*)::int`,
        totalLoss: sql<number>`COALESCE(SUM(ABS(${stockAdjustment.quantityDelta})), 0)::float8`,
      })
      .from(stockAdjustment)
      .where(
        and(
          eq(stockAdjustment.adjustmentType, 'loss'),
          gte(stockAdjustment.createdAt, thirtyDaysAgo),
        ),
      )
      .groupBy(stockAdjustment.businessId, stockAdjustment.productId)
      .having(sql`COUNT(*) >= 3`)
      .limit(300);

    for (const group of lossGroups) {
      if (!group.businessId || !group.productId) continue;

      await saveAndRouteFinding(
        {
          code: 'REPEATED_STOCK_LOSS_PATTERN',
          severity: group.lossCount >= 5 ? 'critical' : 'warning',
          title: 'Repeated stock loss pattern detected',
          explanation: `${group.lossCount} stock loss declarations in the last 30 days for this product, totalling ${group.totalLoss} units. Repeated losses may indicate systematic stock diversion disguised as spoilage or breakage.`,
          findingType: 'repeated_stock_loss',
          observedValue: group.lossCount,
          expectedValue: 2,
        },
        group.businessId,
        group.productId,
      );
    }
  } catch (err) {
    console.error('[Scheduler:SixHourScan] Error:', err);
  }
}

// ---------------------------------------------------------------------------
// Job 4 — Daily Scan
// Reviews all open findings for stale data, escalates if unreviewed >7 days
// ---------------------------------------------------------------------------

async function runDailyScan(): Promise<void> {
  try {
    const sevenDaysAgo = daysAgo(7);

    // Find open findings not reviewed in 7 days — escalate severity
    const staleFindings = await db
      .select({
        id: aiFinding.id,
        severity: aiFinding.severity,
        businessId: aiFinding.businessId,
        findingType: aiFinding.findingType,
        explanation: aiFinding.explanation,
      })
      .from(aiFinding)
      .where(
        and(
          eq(aiFinding.reviewStatus, 'open'),
          sql`${aiFinding.updatedAt} < ${sevenDaysAgo}`,
        ),
      )
      .limit(200);

    for (const finding of staleFindings) {
      // Bump warning → critical if stale
      if (finding.severity === 'warning') {
        await db.update(aiFinding).set({
          severity: 'critical',
          explanation: `[ESCALATED — unreviewed for 7+ days] ${finding.explanation}`,
          updatedAt: new Date(),
        }).where(eq(aiFinding.id, finding.id));

        // Re-route to RRA staff with updated severity
        const { routeFindingToRRAStaff } = await import('@/lib/ai/finding-router');
        await routeFindingToRRAStaff({
          findingId: finding.id,
          findingType: finding.findingType,
          severity: 'critical',
          businessId: finding.businessId ?? '',
          explanation: `ESCALATED: This ${finding.findingType} finding has been open for 7+ days without review. Immediate attention required.`,
        });
      }
    }

    console.log(`[Scheduler:DailyScan] Reviewed ${staleFindings.length} stale findings.`);
  } catch (err) {
    console.error('[Scheduler:DailyScan] Error:', err);
  }
}

// ---------------------------------------------------------------------------
// Entrypoint — called once from server.ts
// ---------------------------------------------------------------------------

let _started = false;

export function startScheduledJobs(): void {
  if (_started) return; // Prevent double-start in Next.js dev hot-reload
  _started = true;

  const FIFTEEN_MIN = 15 * 60 * 1000;
  const ONE_HOUR    = 60 * 60 * 1000;
  const SIX_HOURS   = 6 * 60 * 60 * 1000;
  const ONE_DAY     = 24 * 60 * 60 * 1000;

  // Run immediately on startup, then on interval
  void runQuickScan();
  void runHourlyScan();
  void runSixHourScan();
  void runDailyScan();

  setInterval(() => void runQuickScan(),    FIFTEEN_MIN);
  setInterval(() => void runHourlyScan(),   ONE_HOUR);
  setInterval(() => void runSixHourScan(),  SIX_HOURS);
  setInterval(() => void runDailyScan(),    ONE_DAY);

  console.log('[Scheduler] AI monitoring jobs started: 15min / 1h / 6h / 24h');
}
