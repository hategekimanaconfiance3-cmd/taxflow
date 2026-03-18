// Server-only — AI Revenue Forecast Engine

import { eq, and, sql, gte, lte, desc } from "drizzle-orm";
import db from "@/db/drizzle";
import { transaction, vatRecord, taxPayment, user } from "@/db/schema";

// ---------------------------------------------------------------------------
// AI Revenue Forecasting Engine
// Computes expected vs actual tax revenue, identifies gaps, and projects
// future revenue using linear regression on historical trends.
// From research: Roles_Digital_Tax_System.pdf → Role #5 "Revenue Forecasting"
// ---------------------------------------------------------------------------

export interface RevenueForecast {
    period: string;
    expectedRevenue: number;
    actualRevenue: number;
    gap: number;
    gapPercentage: number;
    trend: "growing" | "stable" | "declining";
    confidence: number;       // 0–100 forecast confidence
    gapCauses: string[];      // human-readable gap explanations
    monthlyData: MonthlyRevenue[];
    projectedNextMonth: number;
    topGapContributors: GapContributor[];
    computedAt: Date;
}

export interface MonthlyRevenue {
    month: string;       // "2026-01"
    expected: number;    // VAT output generated
    actual: number;      // Tax payments received
    gap: number;
    traderCount: number;
}

export interface GapContributor {
    merchantId: string;
    merchantName: string;
    owed: number;
    paid: number;
    gap: number;
    gapPercentage: number;
}

/**
 * Compute revenue forecast for a given period.
 * Default: last 6 months rolling.
 */
export async function getRevenueForecast(
    months: number = 6,
): Promise<RevenueForecast> {
    const monthlyData = await getMonthlyRevenue(months);
    const topGapContributors = await getTopGapContributors();

    const totalExpected = monthlyData.reduce((s, m) => s + m.expected, 0);
    const totalActual = monthlyData.reduce((s, m) => s + m.actual, 0);
    const totalGap = totalExpected - totalActual;
    const gapPercentage = totalExpected > 0
        ? Math.round((totalGap / totalExpected) * 100)
        : 0;

    // Determine trend from last 3 months
    const trend = determineTrend(monthlyData);

    // Project next month using simple linear regression
    const projectedNextMonth = projectNextMonth(monthlyData);

    // Compute forecast confidence from data richness
    const confidence = computeConfidence(monthlyData, months);

    // Derive human-readable gap causes
    const gapCauses = deriveGapCauses(monthlyData, topGapContributors, gapPercentage);

    const periodLabel = `Last ${months} months`;

    return {
        period: periodLabel,
        expectedRevenue: totalExpected,
        actualRevenue: totalActual,
        gap: totalGap,
        gapPercentage,
        trend,
        confidence,
        gapCauses,
        monthlyData,
        projectedNextMonth,
        topGapContributors,
        computedAt: new Date(),
    };
}

// ---------------------------------------------------------------------------
// Monthly revenue breakdown
// ---------------------------------------------------------------------------

async function getMonthlyRevenue(months: number): Promise<MonthlyRevenue[]> {
    const result: MonthlyRevenue[] = [];

    for (let i = months - 1; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const monthStr = `${year}-${String(month).padStart(2, "0")}`;

        const startOfMonth = new Date(year, month - 1, 1);
        const endOfMonth = new Date(year, month, 0, 23, 59, 59);

        try {
            // Expected: VAT output records generated in this month
            const [expected] = await db
                .select({
                    total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)`,
                })
                .from(vatRecord)
                .where(
                    and(
                        eq(vatRecord.vatType, "output"),
                        gte(vatRecord.createdAt, startOfMonth),
                        lte(vatRecord.createdAt, endOfMonth),
                    ),
                );

            // Actual: Tax payments received in this month
            const [actual] = await db
                .select({
                    total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)`,
                })
                .from(taxPayment)
                .where(
                    and(
                        eq(taxPayment.status, "confirmed"),
                        gte(taxPayment.createdAt, startOfMonth),
                        lte(taxPayment.createdAt, endOfMonth),
                    ),
                );

            // Unique traders who transacted
            const [traders] = await db
                .select({
                    count: sql<number>`COUNT(DISTINCT ${transaction.sellerId})::int`,
                })
                .from(transaction)
                .where(
                    and(
                        gte(transaction.createdAt, startOfMonth),
                        lte(transaction.createdAt, endOfMonth),
                    ),
                );

            const expectedVal = expected?.total ?? 0;
            const actualVal = actual?.total ?? 0;

            result.push({
                month: monthStr,
                expected: expectedVal,
                actual: actualVal,
                gap: expectedVal - actualVal,
                traderCount: traders?.count ?? 0,
            });
        } catch (error) {
            console.error(`Failed to get revenue for ${monthStr}:`, error);
            result.push({
                month: monthStr,
                expected: 0,
                actual: 0,
                gap: 0,
                traderCount: 0,
            });
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// Top gap contributors — merchants with highest unpaid tax
// ---------------------------------------------------------------------------

async function getTopGapContributors(limit: number = 10): Promise<GapContributor[]> {
    try {
        // Get total owed per merchant (VAT output)
        const owed = await db
            .select({
                businessId: vatRecord.businessId,
                total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)`,
            })
            .from(vatRecord)
            .where(eq(vatRecord.vatType, "output"))
            .groupBy(vatRecord.businessId);

        // Get total paid per merchant
        const paid = await db
            .select({
                businessId: taxPayment.businessId,
                total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)`,
            })
            .from(taxPayment)
            .where(eq(taxPayment.status, "confirmed"))
            .groupBy(taxPayment.businessId);

        const paidMap = new Map(paid.map((p) => [p.businessId, p.total]));

        // Calculate gaps
        const gaps = owed
            .map((o) => ({
                merchantId: o.businessId,
                owed: o.total,
                paid: paidMap.get(o.businessId) ?? 0,
                gap: o.total - (paidMap.get(o.businessId) ?? 0),
            }))
            .filter((g) => g.gap > 0)
            .sort((a, b) => b.gap - a.gap)
            .slice(0, limit);

        if (gaps.length === 0) return [];

        // Enrich with names
        const merchantIds = gaps.map((g) => g.merchantId);
        const merchants = await db
            .select({ id: user.id, businessName: user.businessName })
            .from(user)
            .where(sql`${user.id} IN (${sql.join(merchantIds.map(id => sql`${id}`), sql`, `)})`);

        const nameMap = new Map(merchants.map((m) => [m.id, m.businessName]));

        return gaps.map((g) => ({
            ...g,
            merchantName: nameMap.get(g.merchantId) ?? "Unknown",
            gapPercentage: g.owed > 0 ? Math.round((g.gap / g.owed) * 100) : 0,
        }));
    } catch (error) {
        console.error("Gap contributors error:", error);
        return [];
    }
}

// ---------------------------------------------------------------------------
// Trend detection & linear regression
// ---------------------------------------------------------------------------

function determineTrend(data: MonthlyRevenue[]): "growing" | "stable" | "declining" {
    if (data.length < 3) return "stable";

    const last3 = data.slice(-3);
    const first = last3[0].actual;
    const last = last3[2].actual;

    if (first === 0) return "stable";

    const changePct = ((last - first) / first) * 100;

    if (changePct > 10) return "growing";
    if (changePct < -10) return "declining";
    return "stable";
}

function projectNextMonth(data: MonthlyRevenue[]): number {
    if (data.length < 2) return data[0]?.actual ?? 0;

    // Simple linear regression on actual revenue
    const n = data.length;
    const xs = data.map((_, i) => i);
    const ys = data.map((d) => d.actual);

    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((sum, x, i) => sum + x * ys[i], 0);
    const sumX2 = xs.reduce((sum, x) => sum + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const projected = Math.round(intercept + slope * n);
    return Math.max(0, projected); // no negative projection
}

// ---------------------------------------------------------------------------
// Confidence scoring — how reliable is the forecast?
// ---------------------------------------------------------------------------

function computeConfidence(data: MonthlyRevenue[], totalMonths: number): number {
    // Base: data availability (0-40 pts)
    const monthsWithData = data.filter((m) => m.expected > 0 || m.actual > 0).length;
    const dataCoverage = Math.round((monthsWithData / totalMonths) * 40);

    // Trader participation (0-30 pts)
    const monthsWithTraders = data.filter((m) => m.traderCount > 0).length;
    const traderCoverage = Math.round((monthsWithTraders / totalMonths) * 30);

    // Trend consistency (0-30 pts) — less variance = more confidence
    const actuals = data.map((m) => m.actual).filter((a) => a > 0);
    let consistencyScore = 30;
    if (actuals.length >= 2) {
        const mean = actuals.reduce((s, v) => s + v, 0) / actuals.length;
        if (mean > 0) {
            const variance = actuals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / actuals.length;
            const cv = Math.sqrt(variance) / mean; // coefficient of variation
            consistencyScore = Math.max(0, Math.round(30 * (1 - Math.min(cv, 1))));
        }
    } else {
        consistencyScore = 5; // very low confidence with <2 data points
    }

    return Math.min(100, dataCoverage + traderCoverage + consistencyScore);
}

// ---------------------------------------------------------------------------
// Gap cause analysis
// ---------------------------------------------------------------------------

function deriveGapCauses(
    monthlyData: MonthlyRevenue[],
    topGapContributors: GapContributor[],
    gapPercentage: number,
): string[] {
    const causes: string[] = [];

    // Check trader activity
    const avgTraders = monthlyData.reduce((s, m) => s + m.traderCount, 0) / Math.max(monthlyData.length, 1);
    if (avgTraders < 3) {
        causes.push("Low trader activity in reporting period");
    }

    // Check for months with zero payments
    const zeroPaymentMonths = monthlyData.filter((m) => m.expected > 0 && m.actual === 0).length;
    if (zeroPaymentMonths > 0) {
        causes.push(`${zeroPaymentMonths} month(s) with zero payments received`);
    }

    // Check for underreporting
    if (gapPercentage > 50) {
        causes.push("Significant underreporting detected");
    } else if (gapPercentage > 20) {
        causes.push("Moderate collection shortfall");
    }

    // Check top contributors
    if (topGapContributors.length > 0) {
        const topContributor = topGapContributors[0];
        causes.push(`Top contributor: ${topContributor.merchantName} (${topContributor.gapPercentage}% unpaid)`);
    }

    // Fallback
    if (causes.length === 0) {
        causes.push("Collection performance within expected range");
    }

    return causes.slice(0, 4); // max 4 causes
}

