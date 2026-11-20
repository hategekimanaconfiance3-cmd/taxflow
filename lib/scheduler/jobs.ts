// Server-only — Scheduled background jobs for TaxFlow AI monitoring
// Started once from server.ts when the HTTP server boots.
// Jobs run on a fixed interval using setInterval — no external queue needed.
// IMPORTANT: All jobs must be fully self-contained and never throw to the
//            top-level (the caller). Errors are logged and swallowed.

import { createHash } from 'node:crypto';
import { eq, and, gte, sql, inArray, lt, isNull, or, not } from 'drizzle-orm';
import db from '@/db/drizzle';
import {
  user, transaction, productionBatch, stock, stockAdjustment,
  aiFinding, importDeclaration, stockMovement,
  industrialGateway, industrialAlert, factory,
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

async function runQuickScan(): Promise<boolean> {
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
    return true;
  } catch (err) {
    console.error('[Scheduler:QuickScan] Error:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Job 2 — Hourly Scan (every 1 hour)
// Checks for sales without matching production or purchases
// ---------------------------------------------------------------------------

async function runHourlyScan(): Promise<boolean> {
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
    return true;
  } catch (err) {
    console.error('[Scheduler:HourlyScan] Error:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Job 3 — Six-Hour Scan
// Checks for repeated stock loss patterns (≥3 loss events in 30 days)
// ---------------------------------------------------------------------------

async function runSixHourScan(): Promise<boolean> {
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
    return true;
  } catch (err) {
    console.error('[Scheduler:SixHourScan] Error:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Job 4 — Daily Scan
// Reviews all open findings for stale data, escalates if unreviewed >7 days
// ---------------------------------------------------------------------------

async function runDailyScan(): Promise<boolean> {
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
    return true;
  } catch (err) {
    console.error('[Scheduler:DailyScan] Error:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Job 5 — Gateway Health Scan (every 5 minutes via Vercel cron)
// Detects stale gateways (no heartbeat > 1h), updates factory connectivity,
// raises deduplicated offline alerts, resolves them on recovery.
// Note: gateway status CHECK only allows pending/active/suspended/revoked —
// we detect "offline" via lastHeartbeatAt staleness without changing status.
// ---------------------------------------------------------------------------

async function runGatewayHealthScan(): Promise<boolean> {
  try {
    const now = new Date();
    const offlineCutoff = new Date(now.getTime() - 60 * 60 * 1000);  // 1 hour
    const onlineCutoff  = new Date(now.getTime() - 10 * 60 * 1000);  // 10 min

    // Find active gateways with stale / absent heartbeat
    const staleGateways = await db
      .select({ id: industrialGateway.id, factoryId: industrialGateway.factoryId, manufacturerId: industrialGateway.manufacturerId })
      .from(industrialGateway)
      .where(and(
        eq(industrialGateway.status, 'active'),
        or(isNull(industrialGateway.lastHeartbeatAt), lt(industrialGateway.lastHeartbeatAt, offlineCutoff)),
      ));

    // Find previously-stale active gateways that have recovered
    const recoveredGateways = await db
      .select({ id: industrialGateway.id, factoryId: industrialGateway.factoryId })
      .from(industrialGateway)
      .where(and(
        eq(industrialGateway.status, 'active'),
        gte(industrialGateway.lastHeartbeatAt, onlineCutoff),
      ));

    // Collect all affected factory IDs
    const affectedFactoryIds = [...new Set([
      ...staleGateways.map(g => g.factoryId),
      ...recoveredGateways.map(g => g.factoryId),
    ].filter(Boolean))] as string[];

    // Update factory connectivityStatus — online if at least one active fresh gateway exists
    for (const factoryId of affectedFactoryIds) {
      const [freshGateway] = await db
        .select({ id: industrialGateway.id })
        .from(industrialGateway)
        .where(and(
          eq(industrialGateway.factoryId, factoryId),
          eq(industrialGateway.status, 'active'),
          gte(industrialGateway.lastHeartbeatAt, onlineCutoff),
        ))
        .limit(1);
      await db.update(factory)
        .set({ connectivityStatus: freshGateway ? 'online' : 'offline', updatedAt: now })
        .where(eq(factory.id, factoryId));
    }

    // Raise deduplicated GATEWAY_OFFLINE alert for each stale gateway
    for (const gw of staleGateways) {
      const dedupeKey = createHash('sha256').update(`GATEWAY_OFFLINE:${gw.id}`).digest('hex');
      await db.insert(industrialAlert).values({
        manufacturerId: gw.manufacturerId,
        factoryId: gw.factoryId,
        gatewayId: gw.id,
        alertType: 'GATEWAY_OFFLINE',
        severity: 'high',
        status: 'open',
        summary: 'Industrial gateway has not sent a heartbeat in over 1 hour.',
        details: { gatewayId: gw.id, offlineCutoffIso: offlineCutoff.toISOString() },
        dedupeKey,
      }).onConflictDoNothing({ target: industrialAlert.dedupeKey });
    }

    // Resolve open GATEWAY_OFFLINE alerts for recovered gateways
    for (const gw of recoveredGateways) {
      const dedupeKey = createHash('sha256').update(`GATEWAY_OFFLINE:${gw.id}`).digest('hex');
      await db.update(industrialAlert)
        .set({ status: 'resolved', resolvedAt: now })
        .where(and(
          eq(industrialAlert.dedupeKey, dedupeKey),
          eq(industrialAlert.status, 'open'),
        ));
    }

    console.log('[Scheduler:GatewayHealth] stale:', staleGateways.length, 'recovered:', recoveredGateways.length, 'factories updated:', affectedFactoryIds.length);
    return true;
  } catch (err) {
    console.error('[Scheduler:GatewayHealth] Error:', err);
    return false;
  }
}

export { runGatewayHealthScan };

/** Execute each bounded monitoring scan once for serverless scheduled runs. */
export async function runMonitoringScansOnce(): Promise<{ failedScans: number }> {
  const results = await Promise.all([
    runQuickScan(),
    runHourlyScan(),
    runSixHourScan(),
    runDailyScan(),
    runGatewayHealthScan(),
  ]);
  return { failedScans: results.filter((result) => !result).length };
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
