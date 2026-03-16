// Server-only — AI Behavioral Analysis Engine

import { eq, and, sql, gte, desc, inArray } from "drizzle-orm";
import db from "@/db/drizzle";
import { transaction, product, user, auditLog } from "@/db/schema";

// ---------------------------------------------------------------------------
// AI Behavioral Analysis Engine
// Builds merchant behavior profiles from transaction history.
// Detects: chronic underreporting, unusual volume patterns, flag responsiveness.
// From research: Roles_Digital_Tax_System.pdf → Role #2 "Behavioral Analysis"
// ---------------------------------------------------------------------------

export interface BehaviorPattern {
    type: "underreporting" | "volume_spike" | "price_inconsistency" | "improving" | "deteriorating";
    severity: "info" | "warning" | "critical";
    description: string;
    metric: number;
}

export interface BehaviorProfile {
    merchantId: string;
    merchantName: string | null;
    patterns: BehaviorPattern[];
    underreportingRate: number;    // 0–100%
    priceConsistency: number;      // 0–100% (higher = more consistent)
    riskTrend: "improving" | "stable" | "worsening";
    totalTransactions: number;
    analyzedPeriodDays: number;
    computedAt: Date;
}

/**
 * Analyze a merchant's behavioral patterns over the last 90 days.
 */
export async function analyzeMerchantBehavior(
    merchantId: string,
): Promise<BehaviorProfile> {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const [merchantInfo, patterns, totalTxns] = await Promise.all([
        getMerchantName(merchantId),
        detectPatterns(merchantId, ninetyDaysAgo),
        countTransactions(merchantId, ninetyDaysAgo),
    ]);

    const underreportingRate = patterns.find(
        (p) => p.type === "underreporting",
    )?.metric ?? 0;

    const priceConsistency = patterns.find(
        (p) => p.type === "price_inconsistency",
    )?.metric ?? 100;

    const riskTrend = await determineRiskTrend(merchantId);

    return {
        merchantId,
        merchantName: merchantInfo,
        patterns,
        underreportingRate,
        priceConsistency,
        riskTrend,
        totalTransactions: totalTxns,
        analyzedPeriodDays: 90,
        computedAt: new Date(),
    };
}

// ---------------------------------------------------------------------------
// Pattern detection
// ---------------------------------------------------------------------------

async function detectPatterns(
    merchantId: string,
    since: Date,
): Promise<BehaviorPattern[]> {
    const patterns: BehaviorPattern[] = [];

    // 1. Underreporting frequency — % of prices below 85% of market median
    const underreporting = await detectUnderreporting(merchantId, since);
    if (underreporting) patterns.push(underreporting);

    // 2. Volume spikes — days with >3× average volume
    const volumeSpike = await detectVolumeSpikes(merchantId, since);
    if (volumeSpike) patterns.push(volumeSpike);

    // 3. Price inconsistency — high coefficient of variation in pricing
    const priceInconsistency = await detectPriceInconsistency(merchantId, since);
    if (priceInconsistency) patterns.push(priceInconsistency);

    // 4. Trend: improving or deteriorating after flags?
    const trendPattern = await detectFlagResponse(merchantId, since);
    if (trendPattern) patterns.push(trendPattern);

    return patterns;
}

/** Detect chronic underreporting: seller prices consistently below market median */
async function detectUnderreporting(
    merchantId: string,
    since: Date,
): Promise<BehaviorPattern | null> {
    try {
        const merchantPrices = await db
            .select({
                productId: transaction.productId,
                unitPrice: transaction.unitPrice,
            })
            .from(transaction)
            .where(
                and(
                    eq(transaction.sellerId, merchantId),
                    inArray(transaction.status, ["confirmed", "completed"]),
                    gte(transaction.createdAt, since),
                ),
            );

        if (merchantPrices.length < 3) return null;

        const productIds = [...new Set(merchantPrices.map((p) => p.productId))];
        let belowCount = 0;

        for (const pid of productIds) {
            const [marketMedian] = await db
                .select({
                    median: sql<number>`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${transaction.unitPrice})`,
                })
                .from(transaction)
                .where(
                    and(
                        eq(transaction.productId, pid),
                        inArray(transaction.status, ["confirmed", "completed"]),
                        gte(transaction.createdAt, since),
                    ),
                );

            if (marketMedian?.median) {
                belowCount += merchantPrices.filter(
                    (p) => p.productId === pid && p.unitPrice < marketMedian.median * 0.85,
                ).length;
            }
        }

        const rate = Math.round((belowCount / merchantPrices.length) * 100);

        if (rate < 10) return null;

        return {
            type: "underreporting",
            severity: rate >= 40 ? "critical" : rate >= 20 ? "warning" : "info",
            description: `${belowCount}/${merchantPrices.length} prices (${rate}%) below 85% of market median`,
            metric: rate,
        };
    } catch (error) {
        console.error("Underreporting detection error:", error);
        return null;
    }
}

/** Detect unusual volume spikes: days with >3× daily average */
async function detectVolumeSpikes(
    merchantId: string,
    since: Date,
): Promise<BehaviorPattern | null> {
    try {
        const dailyCounts = await db
            .select({
                day: sql<string>`DATE(${transaction.createdAt})`,
                count: sql<number>`COUNT(*)::int`,
            })
            .from(transaction)
            .where(
                and(
                    eq(transaction.sellerId, merchantId),
                    gte(transaction.createdAt, since),
                ),
            )
            .groupBy(sql`DATE(${transaction.createdAt})`);

        if (dailyCounts.length < 5) return null;

        const avg = dailyCounts.reduce((s, d) => s + d.count, 0) / dailyCounts.length;
        const spikeDays = dailyCounts.filter((d) => d.count > avg * 3).length;

        if (spikeDays === 0) return null;

        return {
            type: "volume_spike",
            severity: spikeDays >= 5 ? "critical" : spikeDays >= 2 ? "warning" : "info",
            description: `${spikeDays} days with >3× average daily volume (avg: ${Math.round(avg)} txns/day)`,
            metric: spikeDays,
        };
    } catch (error) {
        console.error("Volume spike detection error:", error);
        return null;
    }
}

/** Detect price inconsistency: high coefficient of variation per product */
async function detectPriceInconsistency(
    merchantId: string,
    since: Date,
): Promise<BehaviorPattern | null> {
    try {
        const priceStats = await db
            .select({
                productId: transaction.productId,
                avgPrice: sql<number>`AVG(${transaction.unitPrice})`,
                stddev: sql<number>`STDDEV(${transaction.unitPrice})`,
                count: sql<number>`COUNT(*)::int`,
            })
            .from(transaction)
            .where(
                and(
                    eq(transaction.sellerId, merchantId),
                    inArray(transaction.status, ["confirmed", "completed"]),
                    gte(transaction.createdAt, since),
                ),
            )
            .groupBy(transaction.productId);

        const withEnoughData = priceStats.filter((p) => p.count >= 3 && p.avgPrice > 0);
        if (withEnoughData.length === 0) return null;

        // Coefficient of variation per product, averaged
        const cvValues = withEnoughData.map((p) =>
            p.stddev && p.avgPrice ? (p.stddev / p.avgPrice) * 100 : 0,
        );
        const avgCv = Math.round(cvValues.reduce((s, v) => s + v, 0) / cvValues.length);

        // Higher CV = less consistent (inverted for the metric: 100 - avgCv)
        const consistency = Math.max(0, 100 - avgCv);

        if (avgCv < 15) return null; // Normal variation

        return {
            type: "price_inconsistency",
            severity: avgCv >= 50 ? "critical" : avgCv >= 30 ? "warning" : "info",
            description: `Average price variation of ${avgCv}% across ${withEnoughData.length} product(s)`,
            metric: consistency,
        };
    } catch (error) {
        console.error("Price inconsistency detection error:", error);
        return null;
    }
}

/** Detect response to flags: is behavior improving or deteriorating? */
async function detectFlagResponse(
    merchantId: string,
    since: Date,
): Promise<BehaviorPattern | null> {
    try {
        const flags = await db
            .select({ createdAt: auditLog.createdAt })
            .from(auditLog)
            .where(
                and(
                    eq(auditLog.userId, merchantId),
                    inArray(auditLog.action, [
                        "PRICE_ABOVE_CEILING",
                        "COMPLIANCE_ALERT",
                        "SUSPICIOUS_ACTIVITY",
                    ]),
                    gte(auditLog.createdAt, since),
                ),
            )
            .orderBy(desc(auditLog.createdAt));

        if (flags.length < 2) return null;

        // Compare first-half vs second-half flag counts
        const mid = Math.floor(flags.length / 2);
        const firstHalf = flags.slice(mid).length;
        const secondHalf = flags.slice(0, mid).length;

        if (secondHalf < firstHalf) {
            return {
                type: "improving",
                severity: "info",
                description: `Flags decreased: ${firstHalf} → ${secondHalf} (first half → second half of period)`,
                metric: Math.round(((firstHalf - secondHalf) / firstHalf) * 100),
            };
        }

        if (secondHalf > firstHalf) {
            return {
                type: "deteriorating",
                severity: "warning",
                description: `Flags increased: ${firstHalf} → ${secondHalf} (first half → second half of period)`,
                metric: Math.round(((secondHalf - firstHalf) / Math.max(firstHalf, 1)) * 100),
            };
        }

        return null;
    } catch (error) {
        console.error("Flag response detection error:", error);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getMerchantName(merchantId: string): Promise<string | null> {
    try {
        const [m] = await db
            .select({ businessName: user.businessName })
            .from(user)
            .where(eq(user.id, merchantId))
            .limit(1);
        return m?.businessName ?? null;
    } catch {
        return null;
    }
}

async function countTransactions(merchantId: string, since: Date): Promise<number> {
    try {
        const [r] = await db
            .select({ count: sql<number>`COUNT(*)::int` })
            .from(transaction)
            .where(
                and(
                    eq(transaction.sellerId, merchantId),
                    gte(transaction.createdAt, since),
                ),
            );
        return r?.count ?? 0;
    } catch {
        return 0;
    }
}

async function determineRiskTrend(
    merchantId: string,
): Promise<"improving" | "stable" | "worsening"> {
    try {
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);

        const [firstHalf] = await db
            .select({ count: sql<number>`COUNT(*)::int` })
            .from(auditLog)
            .where(
                and(
                    eq(auditLog.userId, merchantId),
                    inArray(auditLog.action, [
                        "PRICE_ABOVE_CEILING",
                        "COMPLIANCE_ALERT",
                        "SUSPICIOUS_ACTIVITY",
                    ]),
                    gte(auditLog.createdAt, ninetyDaysAgo),
                    sql`${auditLog.createdAt} < ${fortyFiveDaysAgo}`,
                ),
            );

        const [secondHalf] = await db
            .select({ count: sql<number>`COUNT(*)::int` })
            .from(auditLog)
            .where(
                and(
                    eq(auditLog.userId, merchantId),
                    inArray(auditLog.action, [
                        "PRICE_ABOVE_CEILING",
                        "COMPLIANCE_ALERT",
                        "SUSPICIOUS_ACTIVITY",
                    ]),
                    gte(auditLog.createdAt, fortyFiveDaysAgo),
                ),
            );

        const first = firstHalf?.count ?? 0;
        const second = secondHalf?.count ?? 0;

        if (first === 0 && second === 0) return "stable";
        if (second < first) return "improving";
        if (second > first) return "worsening";
        return "stable";
    } catch {
        return "stable";
    }
}
