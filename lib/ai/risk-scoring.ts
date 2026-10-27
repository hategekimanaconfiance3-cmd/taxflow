// Server-only — AI Risk Scoring Engine

import { eq, and, sql, gte, desc, inArray } from "drizzle-orm";
import db from "@/db/drizzle";
import { transaction, stock, vatRecord, taxPayment, user, auditLog, product } from "@/db/schema";
import tinDb from "@/db/tin-drizzle";
import { tinRecord } from "@/db/tin-schema";

// ---------------------------------------------------------------------------
// AI Risk Scoring Engine
// Computes a composite fraud risk score (0–100) per merchant from 5 signals.
// Score is updated conceptually after every transaction.
// From research: Roles_Digital_Tax_System.pdf → Role #3 "Risk Scoring"
// ---------------------------------------------------------------------------

export interface RiskScore {
    score: number;             // 0–100 (higher = riskier)
    level: "low" | "medium" | "high" | "critical";
    factors: RiskFactor[];
    merchantId: string;
    merchantName: string | null;
    district: string | null;
    computedAt: Date;
}

export interface RiskFactor {
    signal: string;
    weight: number;            // 0–1 contribution to total
    value: number;             // raw score for this factor (0–100)
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

    const compositeScore = Math.round(
        factors.reduce((sum, f) => sum + f.value * f.weight, 0),
    );

    const level: RiskScore["level"] =
        compositeScore >= 75 ? "critical" :
        compositeScore >= 50 ? "high" :
        compositeScore >= 25 ? "medium" : "low";

    return {
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

    return scores.sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Signal #1: Price Deviation (25%)
// How often does this merchant's prices deviate below the district median?
// ---------------------------------------------------------------------------

async function computePriceDeviation(
    merchantId: string,
): Promise<{ value: number; description: string }> {
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
            return { value: 0, description: "No recent transactions" };
        }

        // Get market medians per product
        let belowMedianCount = 0;
        const productIds = [...new Set(merchantPrices.map((p) => p.productId))];

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
                        gte(transaction.createdAt, ninetyDaysAgo),
                    ),
                );

            if (marketMedian?.median) {
                const merchantProductPrices = merchantPrices.filter((p) => p.productId === pid);
                for (const mp of merchantProductPrices) {
                    if (mp.unitPrice < marketMedian.median * 0.85) {
                        belowMedianCount++;
                    }
                }
            }
        }

        const deviationPct = (belowMedianCount / merchantPrices.length) * 100;
        const score = Math.min(100, Math.round(deviationPct * 2));

        return {
            value: score,
            description: `${belowMedianCount}/${merchantPrices.length} prices below 85% of market median`,
        };
    } catch (error) {
        console.error("Price deviation error:", error);
        return { value: 0, description: "Unable to compute" };
    }
}

// ---------------------------------------------------------------------------
// Signal #2: Tax Compliance (25%)
// Outstanding tax / total tax owed ratio
// ---------------------------------------------------------------------------

async function computeTaxCompliance(
    merchantId: string,
): Promise<{ value: number; description: string }> {
    try {
        // Total VAT output owed
        const [vatOwed] = await db
            .select({
                total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`,
            })
            .from(vatRecord)
            .where(
                and(
                    eq(vatRecord.businessId, merchantId),
                    eq(vatRecord.isFrozen, false),
                    eq(vatRecord.vatType, "output"),
                ),
            );

        // Total paid
        const [paid] = await db
            .select({
                total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`,
            })
            .from(taxPayment)
            .where(
                and(
                    eq(taxPayment.businessId, merchantId),
                    eq(taxPayment.status, "confirmed"),
                ),
            );

        const owed = vatOwed?.total ?? 0;
        const paidAmount = paid?.total ?? 0;

        if (owed <= 0) {
            return { value: 0, description: "No tax obligations" };
        }

        const compliancePct = Math.min(100, (paidAmount / owed) * 100);
        // Higher risk = lower compliance
        const score = Math.round(Math.max(0, 100 - compliancePct));

        return {
            value: score,
            description: `${Math.round(compliancePct)}% tax paid (${paidAmount.toLocaleString()} / ${owed.toLocaleString()} RWF)`,
        };
    } catch (error) {
        console.error("Tax compliance error:", error);
        return { value: 0, description: "Unable to compute" };
    }
}

// ---------------------------------------------------------------------------
// Signal #3: Transaction Patterns (20%)
// Unusual volume, off-hours activity, rapid-fire transactions
// ---------------------------------------------------------------------------

async function computeTransactionPatterns(
    merchantId: string,
): Promise<{ value: number; description: string }> {
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
                    gte(transaction.createdAt, thirtyDaysAgo),
                ),
            )
            .groupBy(sql`DATE(${transaction.createdAt})`);

        if (dailyCounts.length === 0) {
            return { value: 0, description: "No recent activity" };
        }

        // Calculate average and find spikes
        const avgDaily = dailyCounts.reduce((s, d) => s + d.count, 0) / dailyCounts.length;
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

        const rejectedPct = dailyCounts.length > 0
            ? ((rejectedCount?.count ?? 0) / dailyCounts.reduce((s, d) => s + d.count, 0)) * 100
            : 0;

        const spikeScore = Math.min(50, spikeDays * 15);
        const rejectedScore = Math.min(50, Math.round(rejectedPct * 2));
        const score = Math.min(100, spikeScore + rejectedScore);

        const reasons: string[] = [];
        if (spikeDays > 0) reasons.push(`${spikeDays} spike days (>3× avg)`);
        if (rejectedPct > 10) reasons.push(`${Math.round(rejectedPct)}% rejected/expired`);

        return {
            value: score,
            description: reasons.length > 0 ? reasons.join("; ") : "Normal patterns",
        };
    } catch (error) {
        console.error("Transaction patterns error:", error);
        return { value: 0, description: "Unable to compute" };
    }
}

// ---------------------------------------------------------------------------
// Signal #4: Stock Reconciliation (15%)
// Does their stock balance make sense given purchases and sales?
// ---------------------------------------------------------------------------

async function computeStockReconciliation(
    merchantId: string,
): Promise<{ value: number; description: string }> {
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
                description: `${negativeStock.length} product(s) with negative stock`,
            };
        }

        // Check for zero-stock sales in last 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const currentStock = await db
            .select({ productId: stock.productId, quantity: stock.quantity })
            .from(stock)
            .where(eq(stock.businessId, merchantId));

        const recentSales = await db
            .select({
                productId: transaction.productId,
                totalSold: sql<number>`SUM(${transaction.quantity})`,
            })
            .from(transaction)
            .where(
                and(
                    eq(transaction.sellerId, merchantId),
                    inArray(transaction.status, ["confirmed", "completed"]),
                    gte(transaction.createdAt, thirtyDaysAgo),
                ),
            )
            .groupBy(transaction.productId);

        // If merchant has sales but zero current stock for those products, mild flag
        let zeroStockSalesCount = 0;
        for (const sale of recentSales) {
            const currentQty = currentStock.find((s) => s.productId === sale.productId)?.quantity ?? 0;
            if (currentQty === 0 && sale.totalSold > 0) {
                zeroStockSalesCount++;
            }
        }

        // Check for sell-below-cost (fraud indicator)
        const stockWithPrices = await db
            .select({ productId: stock.productId, price: stock.price })
            .from(stock)
            .where(and(eq(stock.businessId, merchantId), sql`${stock.price} IS NOT NULL AND ${stock.price} > 0`));

        let belowCostCount = 0;
        if (stockWithPrices.length > 0) {
            const costMap = new Map(stockWithPrices.map((s) => [s.productId, s.price ?? 0]));
            const recentSalesWithPrice = await db
                .select({ productId: transaction.productId, unitPrice: transaction.unitPrice })
                .from(transaction)
                .where(
                    and(
                        eq(transaction.sellerId, merchantId),
                        inArray(transaction.status, ["confirmed", "completed"]),
                        gte(transaction.createdAt, thirtyDaysAgo),
                    ),
                )
                .limit(100);

            for (const sale of recentSalesWithPrice) {
                const cost = costMap.get(sale.productId);
                if (cost && sale.unitPrice < cost * 0.9) {
                    belowCostCount++;
                }
            }
        }

        const zeroStockScore = Math.min(30, zeroStockSalesCount * 10);
        const belowCostScore = Math.min(70, belowCostCount * 15);
        const score = Math.min(100, zeroStockScore + belowCostScore);

        const reasons: string[] = [];
        if (belowCostCount > 0) reasons.push(`${belowCostCount} sale(s) below purchase cost`);
        if (zeroStockSalesCount > 0) reasons.push(`${zeroStockSalesCount} product(s) sold to zero stock`);

        return {
            value: score,
            description: reasons.length > 0 ? reasons.join("; ") : "Stock levels consistent",
        };
    } catch (error) {
        console.error("Stock reconciliation error:", error);
        return { value: 0, description: "Unable to compute" };
    }
}

// ---------------------------------------------------------------------------
// Signal #5: Historical Flags (15%)
// Past audit entries for PRICE_ABOVE_CEILING, compliance alerts, etc.
// ---------------------------------------------------------------------------

async function computeHistoricalFlags(
    merchantId: string,
): Promise<{ value: number; description: string }> {
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
            description: count > 0 ? `${count} flags in last 90 days` : "Clean record",
        };
    } catch (error) {
        console.error("Historical flags error:", error);
        return { value: 0, description: "Unable to compute" };
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
