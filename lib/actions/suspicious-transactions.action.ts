"use server";

import { sql, eq, and, gte, inArray } from "drizzle-orm";
import db from "@/db/drizzle";
import { transaction, product, user, stock } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// Suspicious Transactions — detect pricing anomalies and duplicates
// ---------------------------------------------------------------------------

export interface SuspiciousTransactionsData {
    belowMarketPrice: number;
    extremePriceDrops: number;
    duplicateEntries: number;
    totalSuspicious: number;
    recentFlags: SuspiciousFlag[];
}

export interface SuspiciousFlag {
    transactionId: string;
    sellerName: string;
    productName: string;
    unitPrice: number;
    marketMedian: number;
    type: "below_market" | "extreme_drop" | "duplicate" | "below_cost";
    severity: "high" | "medium" | "low";
    detectedAt: string;
}

/**
 * Scan recent transactions for suspicious pricing patterns.
 */
export async function getSuspiciousTransactions(): Promise<SuspiciousTransactionsData> {
    await requireRRASession();

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const flags: SuspiciousFlag[] = [];

        // Get recent transactions with seller/product info
        const recentTxns = await db
            .select({
                id: transaction.id,
                sellerId: transaction.sellerId,
                sellerName: user.businessName,
                productId: transaction.productId,
                productName: product.name,
                unitPrice: transaction.unitPrice,
                quantity: transaction.quantity,
                totalAmount: transaction.totalAmount,
                createdAt: transaction.createdAt,
            })
            .from(transaction)
            .innerJoin(user, eq(transaction.sellerId, user.id))
            .innerJoin(product, eq(transaction.productId, product.id))
            .where(
                and(
                    gte(transaction.createdAt, sevenDaysAgo),
                    inArray(transaction.status, ["confirmed", "completed", "pending"]),
                ),
            );

        if (recentTxns.length === 0) {
            return { belowMarketPrice: 0, extremePriceDrops: 0, duplicateEntries: 0, totalSuspicious: 0, recentFlags: [] };
        }

        // Get market medians per product (last 90 days)
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const productIds = [...new Set(recentTxns.map((t) => t.productId))];

        const medians = new Map<string, number>();
        for (const pid of productIds) {
            const [result] = await db
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
            if (result?.median) {
                medians.set(pid, result.median);
            }
        }

        // Get stock purchase prices (cost basis) for below-cost detection
        const stockPrices = await db
            .select({
                businessId: stock.businessId,
                productId: stock.productId,
                price: stock.price,
            })
            .from(stock)
            .where(sql`${stock.price} IS NOT NULL AND ${stock.price} > 0`);

        const costMap = new Map<string, number>();
        for (const s of stockPrices) {
            costMap.set(`${s.businessId}-${s.productId}`, s.price ?? 0);
        }

        let belowMarketPrice = 0;
        let extremePriceDrops = 0;
        let duplicateEntries = 0;

        // 1. Below market price detection
        for (const txn of recentTxns) {
            const median = medians.get(txn.productId);
            if (!median || median === 0) continue;

            const ratio = txn.unitPrice / median;

            if (ratio < 0.5) {
                // Extreme price drop
                extremePriceDrops++;
                flags.push({
                    transactionId: txn.id,
                    sellerName: txn.sellerName ?? "Unknown",
                    productName: txn.productName,
                    unitPrice: txn.unitPrice,
                    marketMedian: median,
                    type: "extreme_drop",
                    severity: "high",
                    detectedAt: txn.createdAt?.toISOString() ?? new Date().toISOString(),
                });
            } else if (ratio < 0.85) {
                // Below market
                belowMarketPrice++;
                flags.push({
                    transactionId: txn.id,
                    sellerName: txn.sellerName ?? "Unknown",
                    productName: txn.productName,
                    unitPrice: txn.unitPrice,
                    marketMedian: median,
                    type: "below_market",
                    severity: "medium",
                    detectedAt: txn.createdAt?.toISOString() ?? new Date().toISOString(),
                });
            }

            // Below cost detection
            const costKey = `${txn.sellerId}-${txn.productId}`;
            const cost = costMap.get(costKey);
            if (cost && txn.unitPrice < cost) {
                flags.push({
                    transactionId: txn.id,
                    sellerName: txn.sellerName ?? "Unknown",
                    productName: txn.productName,
                    unitPrice: txn.unitPrice,
                    marketMedian: cost,
                    type: "below_cost",
                    severity: "high",
                    detectedAt: txn.createdAt?.toISOString() ?? new Date().toISOString(),
                });
            }
        }

        // 2. Duplicate detection (same seller, product, amount within 1 hour)
        const seen = new Set<string>();
        for (const txn of recentTxns) {
            const hour = txn.createdAt ? new Date(txn.createdAt).setMinutes(0, 0, 0) : 0;
            const key = `${txn.sellerId}-${txn.productId}-${txn.totalAmount}-${hour}`;
            if (seen.has(key)) {
                duplicateEntries++;
                flags.push({
                    transactionId: txn.id,
                    sellerName: txn.sellerName ?? "Unknown",
                    productName: txn.productName,
                    unitPrice: txn.unitPrice,
                    marketMedian: 0,
                    type: "duplicate",
                    severity: "medium",
                    detectedAt: txn.createdAt?.toISOString() ?? new Date().toISOString(),
                });
            }
            seen.add(key);
        }

        // Sort flags by severity
        const severityOrder = { high: 0, medium: 1, low: 2 };
        flags.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

        return {
            belowMarketPrice,
            extremePriceDrops,
            duplicateEntries,
            totalSuspicious: belowMarketPrice + extremePriceDrops + duplicateEntries,
            recentFlags: flags.slice(0, 10),
        };
    } catch (error) {
        console.error("Suspicious transactions error:", error);
        return { belowMarketPrice: 0, extremePriceDrops: 0, duplicateEntries: 0, totalSuspicious: 0, recentFlags: [] };
    }
}
