// Server-only — Revenue Analytics Engine
// Provides richer analytics data than revenue-forecast.ts:
// monthly breakdown, compliance rate, district breakdown, and a simple forecast.
//
// ⚠️  All forecast values are ESTIMATES for demonstration purposes only.
//     They are NOT official RRA projections.

import { eq, and, sql, gte, lte } from "drizzle-orm";
import db from "@/db/drizzle";
import tinDb from "@/db/tin-drizzle";
import { transaction, vatRecord, taxPayment, user } from "@/db/schema";
import { tinRecord } from "@/db/tin-schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RevenueDataPoint {
    period: string;           // "2026-01" for month or "2026-Q1" for quarter
    taxableRevenue: number;   // sum of totalAmount for confirmed transactions (RWF)
    vatCollected: number;     // sum of output VAT records (RWF)
    vatPaid: number;          // sum of confirmed tax payments (RWF)
    outstanding: number;      // vatCollected - vatPaid (≥ 0)
    transactionCount: number; // number of confirmed transactions
}

export interface RevenueSummary {
    byMonth: RevenueDataPoint[];
    byQuarter: RevenueDataPoint[];
    byRole: Record<string, { revenue: number; vat: number }>;
}

export interface ForecastDataPoint {
    period: string;
    value: number;
    low?: number;  // uncertainty lower bound
    high?: number; // uncertainty upper bound
    isForecast: boolean;
}

export interface ForecastResult {
    historicalData: ForecastDataPoint[];
    forecastData: ForecastDataPoint[];
    growthRate: number;   // % MoM average over lookback
    uncertainty: { low: number; high: number }; // expressed as % of forecast value
    disclaimer: string;
}

export interface ComplianceRate {
    rate: number;       // 0–100
    compliant: number;  // traders that paid ≥ 95% of obligation
    total: number;      // traders with any VAT obligation in the period
}

export interface DistrictRevenue {
    district: string;
    revenue: number;  // total taxable revenue (RWF)
    traders: number;  // number of unique traders
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function monthRange(year: number, month: number): { start: Date; end: Date } {
    return {
        start: new Date(year, month - 1, 1),
        end: new Date(year, month, 0, 23, 59, 59, 999),
    };
}

function quarterLabel(month: number): string {
    return `Q${Math.ceil(month / 3)}`;
}

// ---------------------------------------------------------------------------
// getRevenueSummary
// ---------------------------------------------------------------------------

/**
 * Aggregate revenue metrics grouped by month and quarter over the last
 * `months` calendar months (default 12).
 */
export async function getRevenueSummary(months: number = 12): Promise<RevenueSummary> {
    const byMonth: RevenueDataPoint[] = [];

    for (let i = months - 1; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const period = `${year}-${String(month).padStart(2, "0")}`;
        const { start, end } = monthRange(year, month);

        try {
            const [txnRow] = await db
                .select({
                    revenue: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`,
                    count: sql<number>`COUNT(*)::int`,
                })
                .from(transaction)
                .where(
                    and(
                        eq(transaction.status, "confirmed"),
                        gte(transaction.createdAt, start),
                        lte(transaction.createdAt, end),
                    ),
                );

            const [vatRow] = await db
                .select({
                    collected: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`,
                })
                .from(vatRecord)
                .where(
                    and(
                        eq(vatRecord.vatType, "output"),
                        gte(vatRecord.createdAt, start),
                        lte(vatRecord.createdAt, end),
                    ),
                );

            const [paidRow] = await db
                .select({
                    paid: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`,
                })
                .from(taxPayment)
                .where(
                    and(
                        eq(taxPayment.status, "confirmed"),
                        gte(taxPayment.createdAt, start),
                        lte(taxPayment.createdAt, end),
                    ),
                );

            const vatCollected = vatRow?.collected ?? 0;
            const vatPaid = paidRow?.paid ?? 0;

            byMonth.push({
                period,
                taxableRevenue: txnRow?.revenue ?? 0,
                vatCollected,
                vatPaid,
                outstanding: Math.max(0, vatCollected - vatPaid),
                transactionCount: txnRow?.count ?? 0,
            });
        } catch (err) {
            console.error(`getRevenueSummary error for ${period}:`, err);
            byMonth.push({ period, taxableRevenue: 0, vatCollected: 0, vatPaid: 0, outstanding: 0, transactionCount: 0 });
        }
    }

    // Aggregate into quarters
    const quarterMap = new Map<string, RevenueDataPoint>();
    for (const m of byMonth) {
        const [year, monthStr] = m.period.split("-");
        const qLabel = `${year}-${quarterLabel(Number(monthStr))}`;
        const existing = quarterMap.get(qLabel) ?? {
            period: qLabel,
            taxableRevenue: 0,
            vatCollected: 0,
            vatPaid: 0,
            outstanding: 0,
            transactionCount: 0,
        };
        quarterMap.set(qLabel, {
            period: qLabel,
            taxableRevenue: existing.taxableRevenue + m.taxableRevenue,
            vatCollected: existing.vatCollected + m.vatCollected,
            vatPaid: existing.vatPaid + m.vatPaid,
            outstanding: existing.outstanding + m.outstanding,
            transactionCount: existing.transactionCount + m.transactionCount,
        });
    }
    const byQuarter = Array.from(quarterMap.values());

    // Revenue and VAT by trader role
    const roleRows = await db
        .select({
            role: user.role,
            revenue: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`,
            vat: sql<number>`COALESCE(SUM(${transaction.vatAmount}), 0)::float8`,
        })
        .from(transaction)
        .innerJoin(user, eq(transaction.sellerId, user.id))
        .where(eq(transaction.status, "confirmed"))
        .groupBy(user.role)
        .catch(() => []);

    const byRole: Record<string, { revenue: number; vat: number }> = {};
    for (const r of roleRows) {
        byRole[r.role] = { revenue: r.revenue, vat: r.vat };
    }

    return { byMonth, byQuarter, byRole };
}

// ---------------------------------------------------------------------------
// getSimpleRevenueForecast
// ---------------------------------------------------------------------------

/**
 * Generate a simple revenue forecast for the next `forecastMonths` months.
 *
 * Algorithm:
 *   1. Fetch last 12 months of actual VAT collected
 *   2. Compute 3-month simple moving average (SMA-3) as baseline
 *   3. Derive MoM growth rate from linear regression slope
 *   4. Apply seasonal index (ratio of month-avg to overall-avg)
 *   5. Project forward with ±15 % uncertainty band
 *
 * ⚠️  ALWAYS labelled as estimates — never official RRA data.
 */
export async function getSimpleRevenueForecast(forecastMonths: number = 3): Promise<ForecastResult> {
    // Pull last 12 months of data
    const summary = await getRevenueSummary(12);
    const historical = summary.byMonth;

    // Build historical ForecastDataPoints
    const historicalData: ForecastDataPoint[] = historical.map((m) => ({
        period: m.period,
        value: m.vatCollected,
        isForecast: false,
    }));

    if (historical.length < 3) {
        // Not enough data — return zeros
        return {
            historicalData,
            forecastData: [],
            growthRate: 0,
            uncertainty: { low: 15, high: 15 },
            disclaimer: "Estimated — demonstration data. Not an official RRA projection.",
        };
    }

    const values = historical.map((m) => m.vatCollected);

    // 3-month SMA of last 3 points
    const sma3 = (values[values.length - 1] + values[values.length - 2] + values[values.length - 3]) / 3;

    // MoM growth rate from linear regression
    const n = values.length;
    const xs = values.map((_, i) => i);
    const sumX = xs.reduce((s, x) => s + x, 0);
    const sumY = values.reduce((s, y) => s + y, 0);
    const sumXY = xs.reduce((s, x, i) => s + x * values[i], 0);
    const sumX2 = xs.reduce((s, x) => s + x * x, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) || 0;
    const avgY = sumY / n || 1;
    const growthRate = Math.round((slope / avgY) * 10000) / 100; // % MoM, 2 dp

    // Seasonal indices — ratio of each month-slot average to overall average
    // Grouped by calendar month (1-12) using what data we have
    const monthBuckets: Record<number, number[]> = {};
    for (const m of historical) {
        const calMonth = Number(m.period.split("-")[1]);
        if (!monthBuckets[calMonth]) monthBuckets[calMonth] = [];
        monthBuckets[calMonth].push(m.vatCollected);
    }
    const overallAvg = avgY;
    const seasonalIndex: Record<number, number> = {};
    for (const [mo, vals] of Object.entries(monthBuckets)) {
        const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
        seasonalIndex[Number(mo)] = overallAvg > 0 ? avg / overallAvg : 1;
    }

    // Forecast
    const forecastData: ForecastDataPoint[] = [];
    let baseValue = sma3;
    const lastPeriod = historical[historical.length - 1].period;
    const [lastYear, lastMonthStr] = lastPeriod.split("-").map(Number);

    for (let i = 1; i <= forecastMonths; i++) {
        const nextDate = new Date(lastYear, lastMonthStr - 1 + i);
        const calMonth = nextDate.getMonth() + 1;
        const periodStr = `${nextDate.getFullYear()}-${String(calMonth).padStart(2, "0")}`;

        const si = seasonalIndex[calMonth] ?? 1;
        baseValue = Math.max(0, baseValue * (1 + slope / (avgY || 1)));
        const projected = Math.round(baseValue * si);
        const UNCERTAINTY = 0.15;

        forecastData.push({
            period: periodStr,
            value: projected,
            low: Math.round(projected * (1 - UNCERTAINTY)),
            high: Math.round(projected * (1 + UNCERTAINTY)),
            isForecast: true,
        });
    }

    return {
        historicalData,
        forecastData,
        growthRate,
        uncertainty: { low: 15, high: 15 },
        disclaimer: "Estimated — demonstration data. Not an official RRA projection.",
    };
}

// ---------------------------------------------------------------------------
// getComplianceRate
// ---------------------------------------------------------------------------

/**
 * Compute the VAT compliance rate for the last `periodDays` days.
 *
 * A trader is "compliant" if they paid ≥ 95 % of their VAT output obligation
 * in the period.
 */
export async function getComplianceRate(periodDays: number = 30): Promise<ComplianceRate> {
    const since = new Date();
    since.setDate(since.getDate() - periodDays);

    try {
        // VAT obligations per business
        const obligationRows = await db
            .select({
                businessId: vatRecord.businessId,
                obligation: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`,
            })
            .from(vatRecord)
            .where(
                and(
                    eq(vatRecord.vatType, "output"),
                    gte(vatRecord.createdAt, since),
                ),
            )
            .groupBy(vatRecord.businessId);

        if (obligationRows.length === 0) return { rate: 0, compliant: 0, total: 0 };

        const businessIds = obligationRows.map((r) => r.businessId);

        // Tax payments per business in the same period
        const paymentRows = await db
            .select({
                businessId: taxPayment.businessId,
                paid: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`,
            })
            .from(taxPayment)
            .where(
                and(
                    eq(taxPayment.status, "confirmed"),
                    gte(taxPayment.createdAt, since),
                    sql`${taxPayment.businessId} IN (${sql.join(businessIds.map((id) => sql`${id}`), sql`, `)})`,
                ),
            )
            .groupBy(taxPayment.businessId);

        const paidMap = new Map(paymentRows.map((r) => [r.businessId, r.paid]));

        let compliant = 0;
        for (const row of obligationRows) {
            const paid = paidMap.get(row.businessId) ?? 0;
            if (row.obligation > 0 && paid / row.obligation >= 0.95) compliant++;
        }

        const total = obligationRows.length;
        return {
            rate: total > 0 ? Math.round((compliant / total) * 100) : 0,
            compliant,
            total,
        };
    } catch (err) {
        console.error("getComplianceRate error:", err);
        return { rate: 0, compliant: 0, total: 0 };
    }
}

// ---------------------------------------------------------------------------
// getRevenueByDistrict
// ---------------------------------------------------------------------------

/**
 * Return top districts by taxable revenue, joined with TIN DB for district info.
 * Falls back to a simple in-app grouping if TIN DB join fails.
 */
export async function getRevenueByDistrict(): Promise<DistrictRevenue[]> {
    try {
        // Get per-seller revenue from main DB
        const sellerRevenue = await db
            .select({
                sellerId: transaction.sellerId,
                tinNumber: user.tinNumber,
                revenue: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`,
            })
            .from(transaction)
            .innerJoin(user, eq(transaction.sellerId, user.id))
            .where(eq(transaction.status, "confirmed"))
            .groupBy(transaction.sellerId, user.tinNumber);

        if (sellerRevenue.length === 0) return [];

        const tinNumbers = sellerRevenue
            .map((r) => r.tinNumber)
            .filter((t): t is string => t !== null);

        if (tinNumbers.length === 0) return [];

        // Join with TIN DB to get district
        const tinRows = await tinDb
            .select({
                tinNumber: tinRecord.tinNumber,
                district: tinRecord.district,
            })
            .from(tinRecord)
            .where(
                sql`${tinRecord.tinNumber} IN (${sql.join(tinNumbers.map((t) => sql`${t}`), sql`, `)})`,
            );

        const tinDistrictMap = new Map(tinRows.map((r) => [r.tinNumber, r.district ?? "Unknown"]));

        // Aggregate by district
        const districtMap = new Map<string, { revenue: number; traders: Set<string> }>();
        for (const row of sellerRevenue) {
            const district = (row.tinNumber && tinDistrictMap.get(row.tinNumber)) ?? "Unknown";
            const entry = districtMap.get(district) ?? { revenue: 0, traders: new Set() };
            entry.revenue += row.revenue;
            entry.traders.add(row.sellerId);
            districtMap.set(district, entry);
        }

        return Array.from(districtMap.entries())
            .map(([district, data]) => ({
                district,
                revenue: Math.round(data.revenue),
                traders: data.traders.size,
            }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);
    } catch (err) {
        console.error("getRevenueByDistrict error:", err);
        return [];
    }
}
