// Server-only — AI Risk Scoring Engine

import { eq, and, sql, gte, inArray, ne } from "drizzle-orm";
import db from "@/db/drizzle";
import { transaction, stock, user, auditLog, product, vatRecord, taxPayment, industrialVerificationResult } from "@/db/schema";
import tinDb from "@/db/tin-drizzle";
import { tinRecord } from "@/db/tin-schema";

// ---------------------------------------------------------------------------
// AI Risk Scoring Engine
// Computes a composite fraud risk score (0–100) per merchant from 5–6 signals.
//
// Non-manufacturer weights (5 signals, total = 1.00):
//   1. Price deviation          25%
//   2. Tax compliance           25%  ← FIXED: now reads vatRecord + taxPayment
//   3. Transaction patterns     20%
//   4. Stock reconciliation     15%
//   5. Historical flags         15%
//
// Manufacturer weights (6 signals, total = 1.00):
//   1. Price deviation          25%
//   2. Tax compliance           25%
//   3. Transaction patterns     10%
//   4. Stock reconciliation     10%
//   5. Historical flags         10%
//   6. Machine vs declared      20%  ← NEW: reads industrial_verification_result
//
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
 * For manufacturers a 6th signal (machine vs declared output) is included
 * and weights are rebalanced so the total always sums to 1.00.
 */
export async function computeRiskScore(merchantId: string): Promise<RiskScore> {
    const [merchantInfo, priceScore, taxScore, txnScore, stockScore, flagScore, industrialScore] =
        await Promise.all([
            getMerchantInfo(merchantId),
            computePriceDeviation(merchantId),
            computeTaxCompliance(merchantId),
            computeTransactionPatterns(merchantId),
            computeStockReconciliation(merchantId),
            computeHistoricalFlags(merchantId),
            computeIndustrialDiscrepancy(merchantId),
        ]);

    // Use 6-signal layout for manufacturers, 5-signal layout for others.
    const isManufacturer = industrialScore.status !== "not_applicable";

    const factors: RiskFactor[] = isManufacturer
        ? [
            { signal: "Price Deviation",            weight: 0.25, ...priceScore },
            { signal: "Tax Compliance",             weight: 0.25, ...taxScore },
            { signal: "Transaction Patterns",       weight: 0.10, ...txnScore },
            { signal: "Stock Accuracy",             weight: 0.10, ...stockScore },
            { signal: "Historical Flags",           weight: 0.10, ...flagScore },
            { signal: "Machine vs Declared Output", weight: 0.20, ...industrialScore },
          ]
        : [
            { signal: "Price Deviation",            weight: 0.25, ...priceScore },
            { signal: "Tax Compliance",             weight: 0.25, ...taxScore },
            { signal: "Transaction Patterns",       weight: 0.20, ...txnScore },
            { signal: "Stock Accuracy",             weight: 0.15, ...stockScore },
            { signal: "Historical Flags",           weight: 0.15, ...flagScore },
          ];

    // A score is only published when every applicable signal computed successfully.
    // "not_applicable" signals are excluded from the completeness check.
    const applicableFactors = factors.filter((f) => f.status !== "not_applicable");
    const complete = applicableFactors.every((f) => f.status === "computed" && f.value !== null);
    const availableFactors = applicableFactors.filter((f) => f.status === "computed" && f.value !== null).length;
    const hasUnavailableSource = applicableFactors.some((f) => f.status === "unavailable");
    const hasPartialSource = applicableFactors.some((f) => f.status === "partial");

    const status: RiskScore["status"] = complete
        ? "SUCCESS"
        : hasUnavailableSource
          ? "UNAVAILABLE"
          : hasPartialSource || availableFactors > 0
            ? "PARTIAL"
            : "INSUFFICIENT_DATA";

    // For partial scores, compute weighted average over available signals only
    // by renormalising weights so they sum to 1.
    let compositeScore: number | null = null;
    if (complete) {
        compositeScore = Math.round(
            applicableFactors.reduce((sum, f) => sum + (f.value ?? 0) * f.weight, 0),
        );
    } else if (availableFactors > 0) {
        const availableSignals = applicableFactors.filter((f) => f.status === "computed" && f.value !== null);
        const totalWeight = availableSignals.reduce((s, f) => s + f.weight, 0);
        if (totalWeight > 0) {
            compositeScore = Math.round(
                availableSignals.reduce((sum, f) => sum + (f.value ?? 0) * f.weight, 0) / totalWeight,
            );
        }
    }

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
// Outstanding tax / total tax owed ratio — compares VAT output obligations
// to confirmed tax payments received.  Higher unpaid % → higher risk score.
// ---------------------------------------------------------------------------

async function computeTaxCompliance(
    merchantId: string,
): Promise<{ value: number | null; status: RiskFactor["status"]; description: string }> {
    try {
        // Total VAT output obligations ever generated for this merchant
        const [owedRow] = await db
            .select({ total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8` })
            .from(vatRecord)
            .where(and(
                eq(vatRecord.businessId, merchantId),
                eq(vatRecord.vatType, "output"),
            ));

        const owed = owedRow?.total ?? 0;

        if (owed === 0) {
            return { value: null, status: "insufficient_data", description: "No VAT output obligations found" };
        }

        // Total confirmed tax payments received from this merchant
        const [paidRow] = await db
            .select({ total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8` })
            .from(taxPayment)
            .where(and(
                eq(taxPayment.businessId, merchantId),
                eq(taxPayment.status, "confirmed"),
            ));

        const paid = paidRow?.total ?? 0;

        // Unpaid percentage — clamped to [0, 100] to handle overpayments gracefully
        const unpaidPct = Math.max(0, Math.min(100, ((owed - paid) / owed) * 100));

        // Score: 67% unpaid → 100 (critical). 0% unpaid → 0 (low).
        const score = Math.min(100, Math.round(unpaidPct * 1.5));

        return {
            value: score,
            status: "computed",
            description: `${Math.round(unpaidPct)}% outstanding (${Math.round(owed).toLocaleString()} RWF owed, ${Math.round(paid).toLocaleString()} RWF paid)`,
        };
    } catch (error) {
        console.error("Tax compliance error:", error);
        return { value: null, status: "unavailable", description: "Tax compliance source unavailable" };
    }
}

// ---------------------------------------------------------------------------
// Signal #3: Transaction Patterns (20% / 10% for manufacturers)
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
// Signal #4: Stock Reconciliation (15% / 10% for manufacturers)
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
// Signal #5: Historical Flags (15% / 10% for manufacturers)
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
// Signal #6: Machine vs Declared Output (20% — manufacturers only)
// Compares machine-reported batch quantities from industrial gateways against
// the quantities the manufacturer declared.  Returned as "not_applicable"
// for wholesalers and retailers so their weight layout is not disrupted.
// ---------------------------------------------------------------------------

async function computeIndustrialDiscrepancy(
    merchantId: string,
): Promise<{ value: number | null; status: RiskFactor["status"]; description: string }> {
    try {
        // Only applies to manufacturers — check the user role first
        const [merchantRow] = await db
            .select({ role: user.role })
            .from(user)
            .where(eq(user.id, merchantId))
            .limit(1);

        if (!merchantRow || merchantRow.role !== "manufacturer") {
            return { value: null, status: "not_applicable", description: "Industrial signal applies to manufacturers only" };
        }

        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

        // Count verification outcomes in last 90 days
        const results = await db
            .select({ outcome: industrialVerificationResult.outcome })
            .from(industrialVerificationResult)
            .where(and(
                eq(industrialVerificationResult.manufacturerId, merchantId),
                gte(industrialVerificationResult.checkedAt, ninetyDaysAgo),
            ));

        if (results.length === 0) {
            return {
                value: null,
                status: "insufficient_data",
                description: "No industrial batch verification records in the last 90 days",
            };
        }

        const discrepantCount = results.filter((r) => r.outcome === "discrepant").length;
        const discrepancyRate = (discrepantCount / results.length) * 100;

        // Score: 50% discrepant batches → 100 (critical). 0% → 0 (low).
        const score = Math.min(100, Math.round(discrepancyRate * 2));

        return {
            value: score,
            status: "computed",
            description: discrepantCount > 0
                ? `${discrepantCount}/${results.length} batch verifications discrepant between machine and declared quantities`
                : `All ${results.length} batch verifications matched machine data`,
        };
    } catch (error) {
        console.error("Industrial discrepancy error:", error);
        return { value: null, status: "unavailable", description: "Industrial verification source unavailable" };
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
