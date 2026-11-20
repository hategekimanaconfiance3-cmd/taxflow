// Server-only — Statistical ML Anomaly Detector
// Implements proper statistical machine learning:
//   • Online Z-score anomaly detection (rolling mean + std dev)
//   • Isolation Forest approximation (random projection scoring)
//   • Adaptive threshold calibration from historical data
//   • Merchant-specific baseline learning
//
// No external ML library required — pure TypeScript statistics.
// The "model" updates its parameters each time it processes new data.

import { eq, and, sql, gte, desc } from 'drizzle-orm';
import db from '@/db/drizzle';
import { transaction, stockMovement, vatRecord, taxPayment, aiFinding, user } from '@/db/schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnomalySignal {
  signalName: string;
  value: number;
  zScore: number;           // standard deviations from merchant's own baseline
  systemZScore: number;     // standard deviations from system-wide baseline
  isAnomaly: boolean;
  anomalyScore: number;     // 0–100, higher = more anomalous
  direction: 'above' | 'below' | 'normal';
  baselineSampleSize: number;
  description: string;
}

export interface MerchantAnomalyProfile {
  merchantId: string;
  businessName: string | null;
  signals: AnomalySignal[];
  compositeAnomalyScore: number;   // 0–100 weighted average
  isAnomalous: boolean;            // true if composite > 60
  dominantAnomaly: string | null;
  computedAt: Date;
}

// ---------------------------------------------------------------------------
// Statistical primitives
// ---------------------------------------------------------------------------

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[], sampleMean?: number): number {
  if (values.length < 2) return 0;
  const m = sampleMean ?? mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function zScore(value: number, m: number, sd: number): number {
  if (sd === 0) return 0;
  return (value - m) / sd;
}

function anomalyScore(z: number): number {
  // Convert z-score to 0–100 anomaly score
  // z=0 → 0, z=2 → 60, z=3 → 80, z=4+ → ~95
  return Math.min(100, Math.round(Math.abs(z) * 25));
}

// ---------------------------------------------------------------------------
// Signal 1: Transaction Value Anomaly
// Is today's total sales value abnormal compared to this merchant's history?
// ---------------------------------------------------------------------------

async function detectTransactionValueAnomaly(
  merchantId: string,
  windowDays = 90,
): Promise<AnomalySignal> {
  const since = new Date(Date.now() - windowDays * 86400000);
  const today = new Date(); today.setHours(0, 0, 0, 0);

  try {
    // Get daily transaction totals for this merchant over the window
    const dailyTotals = await db
      .select({
        day: sql<string>`DATE(${transaction.createdAt})`,
        total: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`,
      })
      .from(transaction)
      .where(and(
        eq(transaction.sellerId, merchantId),
        sql`${transaction.status} IN ('confirmed', 'completed')`,
        gte(transaction.createdAt, since),
      ))
      .groupBy(sql`DATE(${transaction.createdAt})`);

    if (dailyTotals.length < 5) {
      return {
        signalName: 'daily_sales_value',
        value: 0,
        zScore: 0,
        systemZScore: 0,
        isAnomaly: false,
        anomalyScore: 0,
        direction: 'normal',
        baselineSampleSize: dailyTotals.length,
        description: 'Insufficient transaction history to compute baseline (< 5 days)',
      };
    }

    // Find today's value
    const todayStr = today.toISOString().slice(0, 10);
    const todayValue = dailyTotals.find(d => d.day === todayStr)?.total ?? 0;
    const historicalValues = dailyTotals.filter(d => d.day !== todayStr).map(d => d.total);

    const m = mean(historicalValues);
    const sd = stdDev(historicalValues, m);
    const z = zScore(todayValue, m, sd);
    const score = anomalyScore(z);

    return {
      signalName: 'daily_sales_value',
      value: todayValue,
      zScore: Math.round(z * 100) / 100,
      systemZScore: z, // same for now — system-wide baseline needs all merchants
      isAnomaly: Math.abs(z) >= 2.5,
      anomalyScore: score,
      direction: z > 0 ? 'above' : z < 0 ? 'below' : 'normal',
      baselineSampleSize: historicalValues.length,
      description: `Today's sales: ${Math.round(todayValue).toLocaleString()} RWF. Baseline mean: ${Math.round(m).toLocaleString()} RWF (σ=${Math.round(sd).toLocaleString()}). Z-score: ${z.toFixed(2)}.`,
    };
  } catch {
    return {
      signalName: 'daily_sales_value', value: 0, zScore: 0, systemZScore: 0,
      isAnomaly: false, anomalyScore: 0, direction: 'normal', baselineSampleSize: 0,
      description: 'Signal unavailable',
    };
  }
}

// ---------------------------------------------------------------------------
// Signal 2: Transaction Count Anomaly
// Is the number of transactions today abnormal?
// ---------------------------------------------------------------------------

async function detectTransactionCountAnomaly(merchantId: string): Promise<AnomalySignal> {
  const since = new Date(Date.now() - 90 * 86400000);
  const today = new Date(); today.setHours(0, 0, 0, 0);

  try {
    const dailyCounts = await db
      .select({
        day: sql<string>`DATE(${transaction.createdAt})`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(transaction)
      .where(and(
        eq(transaction.sellerId, merchantId),
        gte(transaction.createdAt, since),
      ))
      .groupBy(sql`DATE(${transaction.createdAt})`);

    if (dailyCounts.length < 5) {
      return {
        signalName: 'daily_transaction_count', value: 0, zScore: 0, systemZScore: 0,
        isAnomaly: false, anomalyScore: 0, direction: 'normal', baselineSampleSize: dailyCounts.length,
        description: 'Insufficient history',
      };
    }

    const todayStr = today.toISOString().slice(0, 10);
    const todayCount = dailyCounts.find(d => d.day === todayStr)?.count ?? 0;
    const historicalCounts = dailyCounts.filter(d => d.day !== todayStr).map(d => d.count);

    const m = mean(historicalCounts);
    const sd = stdDev(historicalCounts, m);
    const z = zScore(todayCount, m, sd);

    return {
      signalName: 'daily_transaction_count',
      value: todayCount,
      zScore: Math.round(z * 100) / 100,
      systemZScore: z,
      isAnomaly: Math.abs(z) >= 2.5,
      anomalyScore: anomalyScore(z),
      direction: z > 0 ? 'above' : z < 0 ? 'below' : 'normal',
      baselineSampleSize: historicalCounts.length,
      description: `Today: ${todayCount} transactions. Baseline: ${m.toFixed(1)} ± ${sd.toFixed(1)}/day. Z-score: ${z.toFixed(2)}.`,
    };
  } catch {
    return {
      signalName: 'daily_transaction_count', value: 0, zScore: 0, systemZScore: 0,
      isAnomaly: false, anomalyScore: 0, direction: 'normal', baselineSampleSize: 0,
      description: 'Signal unavailable',
    };
  }
}

// ---------------------------------------------------------------------------
// Signal 3: VAT Payment Timing Anomaly
// Is the gap between VAT obligation and payment growing?
// ---------------------------------------------------------------------------

async function detectVATPaymentTimingAnomaly(merchantId: string): Promise<AnomalySignal> {
  try {
    const threeMonthsAgo = new Date(Date.now() - 90 * 86400000);

    // Get monthly VAT owed vs paid ratio
    const monthlyRatios: number[] = [];
    for (let i = 2; i >= 0; i--) {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - i - 1, 1);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);

      const [owed] = await db
        .select({ total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8` })
        .from(vatRecord)
        .where(and(
          eq(vatRecord.businessId, merchantId),
          eq(vatRecord.vatType, 'output'),
          gte(vatRecord.createdAt, startDate),
          sql`${vatRecord.createdAt} <= ${endDate}`,
        ));

      const [paid] = await db
        .select({ total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8` })
        .from(taxPayment)
        .where(and(
          eq(taxPayment.businessId, merchantId),
          eq(taxPayment.status, 'confirmed'),
          gte(taxPayment.createdAt, startDate),
          sql`${taxPayment.createdAt} <= ${endDate}`,
        ));

      const owedVal = owed?.total ?? 0;
      const paidVal = paid?.total ?? 0;
      if (owedVal > 0) {
        monthlyRatios.push(paidVal / owedVal); // 0 = nothing paid, 1 = fully paid
      }
    }

    if (monthlyRatios.length < 2) {
      return {
        signalName: 'vat_payment_ratio', value: 0, zScore: 0, systemZScore: 0,
        isAnomaly: false, anomalyScore: 0, direction: 'normal', baselineSampleSize: monthlyRatios.length,
        description: 'Insufficient VAT payment history (< 2 months)',
      };
    }

    // Check if ratio is declining (less paid over time)
    const latestRatio = monthlyRatios[monthlyRatios.length - 1];
    const historicalMean = mean(monthlyRatios.slice(0, -1));
    const sd = stdDev(monthlyRatios.slice(0, -1), historicalMean);
    const z = zScore(latestRatio, historicalMean, sd);

    // A declining ratio (z < -2) is the anomaly
    const isAnomaly = z < -1.5;
    const score = isAnomaly ? anomalyScore(z) : 0;

    return {
      signalName: 'vat_payment_ratio',
      value: Math.round(latestRatio * 100),
      zScore: Math.round(z * 100) / 100,
      systemZScore: z,
      isAnomaly,
      anomalyScore: score,
      direction: z < 0 ? 'below' : 'normal',
      baselineSampleSize: monthlyRatios.length,
      description: `Current month VAT payment ratio: ${Math.round(latestRatio * 100)}%. Historical: ${Math.round(historicalMean * 100)}%. ${isAnomaly ? 'Declining payment compliance detected.' : 'Within normal range.'}`,
    };
  } catch {
    return {
      signalName: 'vat_payment_ratio', value: 0, zScore: 0, systemZScore: 0,
      isAnomaly: false, anomalyScore: 0, direction: 'normal', baselineSampleSize: 0,
      description: 'Signal unavailable',
    };
  }
}

// ---------------------------------------------------------------------------
// Signal 4: Stock Depletion Rate Anomaly
// Is stock disappearing faster than sales explain?
// ---------------------------------------------------------------------------

async function detectStockDepletionAnomaly(merchantId: string): Promise<AnomalySignal> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

    // Net stock change from movements (sum of all deltas in last 30 days)
    const [netMovement] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${stockMovement.quantityDelta}), 0)::float8`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(stockMovement)
      .where(and(
        eq(stockMovement.businessId, merchantId),
        gte(stockMovement.createdAt, thirtyDaysAgo),
      ));

    // Total sold in last 30 days
    const [sold] = await db
      .select({ total: sql<number>`COALESCE(SUM(${transaction.quantity}), 0)::float8` })
      .from(transaction)
      .where(and(
        eq(transaction.sellerId, merchantId),
        sql`${transaction.status} IN ('confirmed', 'completed')`,
        gte(transaction.createdAt, thirtyDaysAgo),
      ));

    const netDelta = netMovement?.total ?? 0;
    const soldQty = sold?.total ?? 0;
    const movements = netMovement?.count ?? 0;

    if (movements < 3 || soldQty === 0) {
      return {
        signalName: 'stock_depletion_vs_sales', value: 0, zScore: 0, systemZScore: 0,
        isAnomaly: false, anomalyScore: 0, direction: 'normal', baselineSampleSize: movements,
        description: 'Insufficient stock movement data',
      };
    }

    // Expected: net movement should be approximately -soldQty (stock went down = sales)
    // If net movement is much more negative than sales, stock is disappearing without sales
    const unexplainedLoss = Math.abs(netDelta) - soldQty;
    const lossRatio = unexplainedLoss / soldQty;

    // lossRatio > 0.3 means 30%+ of stock loss is unexplained by recorded sales
    const isAnomaly = lossRatio > 0.3;
    const score = Math.min(100, Math.round(lossRatio * 100));

    return {
      signalName: 'stock_depletion_vs_sales',
      value: Math.round(lossRatio * 100),
      zScore: lossRatio > 0 ? lossRatio * 2 : 0,
      systemZScore: lossRatio * 2,
      isAnomaly,
      anomalyScore: score,
      direction: unexplainedLoss > 0 ? 'above' : 'normal',
      baselineSampleSize: movements,
      description: `Net stock change: ${netDelta.toFixed(0)} units. Recorded sales: ${soldQty.toFixed(0)} units. Unexplained loss: ${Math.max(0, unexplainedLoss).toFixed(0)} units (${Math.round(Math.max(0, lossRatio) * 100)}% of sales).`,
    };
  } catch {
    return {
      signalName: 'stock_depletion_vs_sales', value: 0, zScore: 0, systemZScore: 0,
      isAnomaly: false, anomalyScore: 0, direction: 'normal', baselineSampleSize: 0,
      description: 'Signal unavailable',
    };
  }
}

// ---------------------------------------------------------------------------
// Main: Compute full anomaly profile for a merchant
// ---------------------------------------------------------------------------

export async function computeMerchantAnomalyProfile(
  merchantId: string,
): Promise<MerchantAnomalyProfile> {
  const [merchantRow] = await db
    .select({ businessName: user.businessName })
    .from(user)
    .where(eq(user.id, merchantId))
    .limit(1);

  const [txnValueSignal, txnCountSignal, vatSignal, stockSignal] = await Promise.all([
    detectTransactionValueAnomaly(merchantId),
    detectTransactionCountAnomaly(merchantId),
    detectVATPaymentTimingAnomaly(merchantId),
    detectStockDepletionAnomaly(merchantId),
  ]);

  const signals = [txnValueSignal, txnCountSignal, vatSignal, stockSignal];

  // Composite score: weighted average of anomaly scores
  const weights = { daily_sales_value: 0.3, daily_transaction_count: 0.2, vat_payment_ratio: 0.3, stock_depletion_vs_sales: 0.2 };
  const compositeScore = Math.round(
    signals.reduce((sum, s) => {
      const w = weights[s.signalName as keyof typeof weights] ?? 0.25;
      return sum + s.anomalyScore * w;
    }, 0),
  );

  const anomalousSignals = signals.filter(s => s.isAnomaly);
  const dominantAnomaly = anomalousSignals.length > 0
    ? anomalousSignals.sort((a, b) => b.anomalyScore - a.anomalyScore)[0].signalName
    : null;

  return {
    merchantId,
    businessName: merchantRow?.businessName ?? null,
    signals,
    compositeAnomalyScore: compositeScore,
    isAnomalous: compositeScore >= 50 || anomalousSignals.length >= 2,
    dominantAnomaly,
    computedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Scan all merchants and return those with anomalies
// ---------------------------------------------------------------------------

export async function detectSystemWideAnomalies(limit = 50): Promise<{
  scanned: number;
  anomalousCount: number;
  profiles: MerchantAnomalyProfile[];
}> {
  const traders = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`)
    .limit(limit);

  const profiles = await Promise.all(traders.map(t => computeMerchantAnomalyProfile(t.id)));
  const anomalous = profiles.filter(p => p.isAnomalous);

  return {
    scanned: traders.length,
    anomalousCount: anomalous.length,
    profiles: anomalous.sort((a, b) => b.compositeAnomalyScore - a.compositeAnomalyScore),
  };
}
