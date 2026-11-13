// Server-only — AI Risk Scoring Engine

import { eq, and, sql, gte, inArray, ne } from "drizzle-orm";
import db from "@/db/drizzle";
import { transaction, stock, user, auditLog, product } from "@/db/schema";
import tinDb from "@/db/tin-drizzle";
import { tinRecord } from "@/db/tin-schema";

// ---------------------------------------------------------------------------
// AI Risk Scoring Engine
// Computes a composite fraud risk score (0–100) per merchant from 5 signals.
// Score is updated conceptually after every transaction.
// From research: Roles_Digital_Tax_System.pdf → Role #3 "Risk Scoring"
// ---------------------------------------------------------------------------

export interface RiskScore {
    status: "SUCCESS" | "PARTIAL" | "INSUFFICIENT_DATA" | "UNAVAILABLE";
    score: number | null;      // withheld unless every required factor is valid
    level: "low" | "medium" | "high" | "critical" | "unavailable";
    factors: RiskFactor[];
    merchantId: string;
    merchantName: string | null;
    district: string | null;
    computedAt: Date;
}

export interface RiskFactor {
    signal: string;
    weight: number;            // 0–1 contribution to total
    value: number | null;      // raw score for this factor (0–100)
    status: "computed" | "partial" | "insufficient_data" | "unavailable" | "not_applicable";
    description: string;
}

/**
 * Compute risk score for a single merchant.
 *
 * 5 Signals (weighted):
 *   1. Price deviation (25%) — how often their prices deviate below market
 *   2. Tax compliance (25%) — outstanding / owed ratio
 *   3. Transaction patterns (20%) — unusual volume or timing
 *   4. Stock reconciliation (15%) — stock accuracy
 *   5. Historical flags (15%) — past audit flags and price ceiling breaches
 */
export async function computeRiskScore(merchantId: string): Promise<RiskScore> {
    const [merchantInfo, priceScore, taxScore, txnScore, stockScore, flagScore] =
        await Promise.all([
            getMerchantInfo(merchantId),
            computePriceDeviation(merchantId),
            computeTaxCompliance(merchantId),
            computeTransactionPatterns(merchantId),
            computeStockReconciliation(merchantId),
            computeHistoricalFlags(merchantId),
        ]);

    const factors: RiskFactor[] = [
        { signal: "Price Deviation", weight: 0.25, ...priceScore },
        { signal: "Tax Compliance", weight: 0.25, ...taxScore },
        { signal: "Transaction Patterns", weight: 0.20, ...txnScore },
        { signal: "Stock Accuracy", weight: 0.15, ...stockScore },
        { signal: "Historical Flags", weight: 0.15, ...flagScore },
    ];

    const complete = factors.every((factor) => factor.status === "computed" && factor.value !== null);
    const availableFactors = factors.filter((factor) => factor.status === "computed" && factor.value !== null).length;
    const hasUnavailableSource = factors.some((factor) => factor.status === "unavailable");
    const hasPartialSource = factors.some((factor) => factor.status === "partial");
    const status: RiskScore["status"] = complete
        ? "SUCCESS"
        : hasUnavailableSource
          ? "UNAVAILABLE"
          : hasPartialSource || availableFactors > 0
            ? "PARTIAL"
            : "INSUFFICIENT_DATA";
    const compositeScore = complete
        ? Math.round(factors.reduce((sum, factor) => sum + (factor.value ?? 0) * factor.weight, 0))
        : null;

    const level: RiskScore["level"] = compositeScore === null ? "unavailable" :
        compositeScore >= 75 ? "critical" :
        compositeScore >= 50 ? "high" :
        compositeScore >= 25 ? "medium" : "low";

    return {
        status,
        score: compositeScore,
        level,
        factors,
        merchantId,
        merchantName: merchantInfo?.businessName ?? null,
        district: merchantInfo?.district ?? null,
        computedAt: new Date(),
    };
}

/**
 * Compute risk scores for all traders, sorted by risk (highest first).
 */
export async function computeAllRiskScores(): Promise<RiskScore[]> {
    const traders = await db
        .select({ id: user.id })
        .from(user)
        .where(sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`);

    const scores = await Promise.all(
        traders.map((t) => computeRiskScore(t.id)),
    );

    return scores.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

// ---------------------------------------------------------------------------
// Signal #1: Price Deviation (25%)
// How often does this merchant's prices deviate below the district median?
// ---------------------------------------------------------------------------

async function computePriceDeviation(
    merchantId: string,
): Promise<{ value: number | null; status: RiskFactor["status"]; description: string }> {
    try {
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

        // Get merchant's recent sale prices
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
                    gte(transaction.createdAt, ninetyDaysAgo),
                ),
            );

        if (merchantPrices.length === 0) {
            return { value: null, status: "insufficient_data", description: "No eligible recent transactions" };
        }

        const productIds = [...new Set(merchantPrices.map((p) => p.productId))];
        const marketMedians = await db
            .select({
                productId: transaction.productId,
                median: sql<number | null>`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${transaction.unitPrice})`,
            })
            .from(transaction)
            .where(and(
                inArray(transaction.productId, productIds),
                ne(transaction.sellerId, merchantId),
                inArray(transaction.status, ["confirmed", "completed"]),
                gte(transaction.createdAt, ninetyDaysAgo),
            ))
            .groupBy(transaction.productId);
        const medianByProduct = new Map(marketMedians.map((row) => [row.productId, row.median]));
        const comparablePrices = merchantPrices.filter((price) => medianByProduct.get(price.productId) != null);

        if (comparablePrices.length === 0) {
            return { value: null, status: "insufficient_data", description: "No comparable market transactions" };
        }

        const belowMedianCount = comparablePrices.filter((price) => {
            const median = medianByProduct.get(price.productId);
            return median !== undefined && median !== null && price.unitPrice < median * 0.85;
        }).length;
        const deviationPct = (belowMedianCount / comparablePrices.length) * 100;
        const score = Math.min(100, Math.round(deviationPct * 2));

        return {
            value: score,
            status: comparablePrices.length === merchantPrices.length ? "computed" : "partial",
            description: `${belowMedianCount}/${comparablePrices.length} comparable prices below 85% of peer median${comparablePrices.length < merchantPrices.length ? `; ${merchantPrices.length - comparablePrices.length} prices had no peer comparison` : ""}`,
        };
    } catch (error) {
        console.error("Price deviation error:", error);
        return { value: null, status: "unavailable", description: "Price evidence source unavailable" };
    }
}

// ---------------------------------------------------------------------------
// Signal #2: Tax Compliance (25%)
// Outstanding tax / total tax owed ratio
// ---------------------------------------------------------------------------

async function computeTaxCompliance(
    merchantId: string,
): Promise<{ value: number | null; status: RiskFactor["status"]; description: string }> {
    // There is no finalized obligation-to-payment relationship in the current schema.
    // Comparing aggregate VAT records with generic payments would misstate compliance.
    void merchantId;
    return { value: null, status: "not_applicable", description: "Finalized obligation-linked payment evidence is not available" };
}

// ---------------------------------------------------------------------------
// Signal #3: Transaction Patterns (20%)
// Unusual volume, off-hours activity, rapid-fire transactions
// ---------------------------------------------------------------------------

async function computeTransactionPatterns(
    merchantId: string,
): Promise<{ value: number | null; status: RiskFactor["status"]; description: string }> {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        // Get daily transaction counts for this merchant
        const dailyCounts = await db
            .select({
                day: sql<string>`DATE(${transaction.createdAt})`,
                count: sql<number>`COUNT(*)::int`,
                totalValue: sql<number>`SUM(${transaction.totalAmount})`,
            })
            .from(transaction)
            .where(
                and(
                    eq(transaction.sellerId, merchantId),
                    inArray(transaction.status, ["confirmed", "completed"]),
                    gte(transaction.createdAt, thirtyDaysAgo),
                ),
            )
            .groupBy(sql`DATE(${transaction.createdAt})`);

        if (dailyCounts.length === 0) {
            return { value: null, status: "insufficient_data", description: "No recent transaction activity to evaluate" };
        }

        // Calculate average and find spikes
        const avgDaily = dailyCounts.reduce((s, d) => s + d.count, 0) / 30;
        const spikeDays = dailyCounts.filter((d) => d.count > avgDaily * 3).length;

        // Check for rejected/expired transactions (red flag)
        const [rejectedCount] = await db
            .select({ count: sql<number>`COUNT(*)::int` })
            .from(transaction)
            .where(
                and(
                    eq(transaction.sellerId, merchantId),
                    inArray(transaction.status, ["rejected", "expired"]),
                    gte(transaction.createdAt, thirtyDaysAgo),
                ),
            );

        const eligibleCount = dailyCounts.reduce((sum, day) => sum + day.count, 0) + (rejectedCount?.count ?? 0);
        const rejectedPct = eligibleCount > 0 ? ((rejectedCount?.count ?? 0) / eligibleCount) * 100 : 0;

        const spikeScore = Math.min(50, spikeDays * 15);
        const rejectedScore = Math.min(50, Math.round(rejectedPct * 2));
        const score = Math.min(100, spikeScore + rejectedScore);

        const reasons: string[] = [];
        if (spikeDays > 0) reasons.push(`${spikeDays} spike days (>3× avg)`);
        if (rejectedPct > 10) reasons.push(`${Math.round(rejectedPct)}% rejected/expired`);

        return {
            value: score,
            status: "computed",
            description: reasons.length > 0 ? reasons.join("; ") : "Normal patterns",
        };
    } catch (error) {
        console.error("Transaction patterns error:", error);
        return { value: null, status: "unavailable", description: "Transaction evidence source unavailable" };
    }
}

// ---------------------------------------------------------------------------
// Signal #4: Stock Reconciliation (15%)
// Does their stock balance make sense given purchases and sales?
// ---------------------------------------------------------------------------

async function computeStockReconciliation(
    merchantId: string,
): Promise<{ value: number | null; status: RiskFactor["status"]; description: string }> {
    try {
        // Check for negative stock (critical red flag)
        const negativeStock = await db
            .select({
                productId: stock.productId,
                quantity: stock.quantity,
                productName: product.name,
            })
            .from(stock)
            .innerJoin(product, eq(stock.productId, product.id))
            .where(
                and(
                    eq(stock.businessId, merchantId),
                    sql`${stock.quantity} < 0`,
                ),
            );

        if (negativeStock.length > 0) {
            return {
                value: 100,
                status: "computed",
                description: `${negativeStock.length} product(s) with negative stock`,
            };
        }

        return { value: null, status: "insufficient_data", description: "Complete verified stock-movement reconstruction is not available" };
    } catch (error) {
        console.error("Stock reconciliation error:", error);
        return { value: null, status: "unavailable", description: "Stock evidence source unavailable" };
    }
}

// ---------------------------------------------------------------------------
// Signal #5: Historical Flags (15%)
// Past audit entries for PRICE_ABOVE_CEILING, compliance alerts, etc.
// ---------------------------------------------------------------------------

async function computeHistoricalFlags(
    merchantId: string,
): Promise<{ value: number | null; status: RiskFactor["status"]; description: string }> {
    try {
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

        const [flagCount] = await db
            .select({ count: sql<number>`COUNT(*)::int` })
            .from(auditLog)
            .where(
                and(
                    eq(auditLog.userId, merchantId),
                    inArray(auditLog.action, [
                        "PRICE_ABOVE_CEILING",
                        "CLEARANCE_SUSPENDED",
                        "COMPLIANCE_ALERT",
                        "SUSPICIOUS_ACTIVITY",
                    ]),
                    gte(auditLog.createdAt, ninetyDaysAgo),
                ),
            );

        const count = flagCount?.count ?? 0;
        const score = Math.min(100, count * 20);

        return {
            value: score,
            status: "computed",
            description: count > 0 ? `${count} matching audit flags in last 90 days` : "No matching audit flags found in the queried audit source",
        };
    } catch (error) {
        console.error("Historical flags error:", error);
        return { value: null, status: "unavailable", description: "Historical audit source unavailable" };
    }
}

// ---------------------------------------------------------------------------
// Helper: get merchant info
// ---------------------------------------------------------------------------

async function getMerchantInfo(merchantId: string) {
    try {
        const [merchant] = await db
            .select({
                businessName: user.businessName,
                tinNumber: user.tinNumber,
            })
            .from(user)
            .where(eq(user.id, merchantId))
            .limit(1);

        let district: string | null = null;
        if (merchant?.tinNumber) {
            const [tin] = await tinDb
                .select({ district: tinRecord.district })
                .from(tinRecord)
                .where(eq(tinRecord.tinNumber, merchant.tinNumber))
                .limit(1);
            district = tin?.district ?? null;
        }

        return { businessName: merchant?.businessName ?? null, district };
    } catch {
        return null;
    }
}
