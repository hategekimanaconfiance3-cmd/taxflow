// Server-only — AI Price Suggestion Engine

import { eq, and, sql, gte, inArray } from "drizzle-orm";
import db from "@/db/drizzle";
import { transaction, stock, user } from "@/db/schema";
import tinDb from "@/db/tin-drizzle";
import { tinRecord } from "@/db/tin-schema";

// ---------------------------------------------------------------------------
// AI Price Suggestion Engine
// Computes a defensible price range from 3 independent data sources.
// Formula from research: Price_Suggestion_System.pdf
// ---------------------------------------------------------------------------

export interface PriceSuggestion {
    suggested: number;
    floor: number;
    ceiling: number;
    confidence: "high" | "medium" | "low";
    dataPoints: number;
    district: string | null;
    historicalMedian: number | null;
    peerMedian: number | null;
    purchaseCost: number | null;
    status: "ready" | "limited_data" | "no_data";
}

/**
 * Compute the AI-suggested price range for a product sold by a specific user.
 *
 * Formula:
 *   suggested = 0.40 × historical_median + 0.40 × peer_median + 0.20 × floor_anchor
 *   floor     = max(purchase_price × 1.05, suggested × 0.80)
 *   ceiling   = suggested × 1.25
 *
 * Fallback (< 5 data points):
 *   floor   = purchase_price × 1.05
 *   ceiling = purchase_price × 2.00
 */
export async function getPriceSuggestion(
    productId: string,
    sellerUserId: string,
): Promise<PriceSuggestion> {
    // 1. Get seller's district from TIN DB
    const sellerDistrict = await getSellerDistrict(sellerUserId);

    // 2. Get the seller's purchase cost for this product
    const purchaseCost = await getPurchaseCost(productId, sellerUserId);

    // 3. Get historical median (90-day confirmed transactions for this product in this district)
    const historicalMedian = await getHistoricalMedian(productId, sellerDistrict);

    // 4. Get peer median (P25–P75 percentile of current prices from peers in same district)
    const peerMedian = await getPeerMedian(productId, sellerUserId, sellerDistrict);

    // Count total data points for confidence
    const dataPoints = await getDataPointCount(productId, sellerDistrict);

    // --- Compute the range ---

    // Fallback: limited or no data
    if (dataPoints < 5) {
        if (purchaseCost && purchaseCost > 0) {
            return {
                suggested: Math.round(purchaseCost * 1.5),
                floor: Math.round(purchaseCost * 1.05),
                ceiling: Math.round(purchaseCost * 2.0),
                confidence: "low",
                dataPoints,
                district: sellerDistrict,
                historicalMedian,
                peerMedian,
                purchaseCost,
                status: "limited_data",
            };
        }

        // No data at all
        return {
            suggested: 0,
            floor: 0,
            ceiling: 0,
            confidence: "low",
            dataPoints: 0,
            district: sellerDistrict,
            historicalMedian: null,
            peerMedian: null,
            purchaseCost: null,
            status: "no_data",
        };
    }

    // Full formula
    const floorAnchor = purchaseCost && purchaseCost > 0
        ? purchaseCost * 1.05
        : (historicalMedian ?? 0);

    const hist = historicalMedian ?? 0;
    const peer = peerMedian ?? hist;
    const anchor = floorAnchor;

    const suggested = Math.round(0.40 * hist + 0.40 * peer + 0.20 * anchor);

    const floor = Math.round(
        Math.max(
            purchaseCost ? purchaseCost * 1.05 : 0,
            suggested * 0.80,
        ),
    );
    const ceiling = Math.round(suggested * 1.25);

    const confidence: PriceSuggestion["confidence"] =
        dataPoints >= 20 ? "high" : dataPoints >= 10 ? "medium" : "low";

    return {
        suggested,
        floor,
        ceiling,
        confidence,
        dataPoints,
        district: sellerDistrict,
        historicalMedian: hist,
        peerMedian: peer,
        purchaseCost: purchaseCost,
        status: "ready",
    };
}

/**
 * Validate a price against the AI floor. Returns null if valid,
 * or a descriptive error string if blocked.
 */
export async function validatePriceFloor(
    productId: string,
    sellerUserId: string,
    declaredPrice: number,
): Promise<{ valid: boolean; error: string | null; suggestion: PriceSuggestion }> {
    const suggestion = await getPriceSuggestion(productId, sellerUserId);

    // If no data, allow any price (system just launched or new product)
    if (suggestion.status === "no_data") {
        return { valid: true, error: null, suggestion };
    }

    if (suggestion.floor > 0 && declaredPrice < suggestion.floor) {
        return {
            valid: false,
            error:
                `The minimum price for this product in ${suggestion.district ?? "your district"} is ` +
                `${suggestion.floor.toLocaleString()} RWF, based on ${suggestion.dataPoints > 0
                    ? `your purchase cost and market data from ${suggestion.dataPoints} transactions`
                    : "your purchase cost"
                }. Please enter a price at or above ${suggestion.floor.toLocaleString()} RWF.`,
            suggestion,
        };
    }

    return { valid: true, error: null, suggestion };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Look up the seller's district from the TIN DB via their TIN number. */
async function getSellerDistrict(sellerUserId: string): Promise<string | null> {
    try {
        // Get seller's TIN from main DB
        const [seller] = await db
            .select({ tinNumber: user.tinNumber })
            .from(user)
            .where(eq(user.id, sellerUserId))
            .limit(1);

        if (!seller?.tinNumber) return null;

        // Look up district from TIN DB
        const [tin] = await tinDb
            .select({ district: tinRecord.district })
            .from(tinRecord)
            .where(eq(tinRecord.tinNumber, seller.tinNumber))
            .limit(1);

        return tin?.district ?? null;
    } catch (error) {
        console.error("Failed to look up seller district:", error);
        return null;
    }
}

/** Get the seller's known purchase cost for this product (from stock.price). */
async function getPurchaseCost(
    productId: string,
    sellerUserId: string,
): Promise<number | null> {
    try {
        const [sellerStock] = await db
            .select({ price: stock.price })
            .from(stock)
            .where(
                and(
                    eq(stock.businessId, sellerUserId),
                    eq(stock.productId, productId),
                ),
            )
            .limit(1);

        return sellerStock?.price ?? null;
    } catch (error) {
        console.error("Failed to get purchase cost:", error);
        return null;
    }
}

/**
 * 90-day rolling median of confirmed/completed transaction prices
 * for this product, filtered by district when available.
 */
async function getHistoricalMedian(
    productId: string,
    district: string | null,
): Promise<number | null> {
    try {
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

        // Get all confirmed/completed unit prices for this product in the last 90 days
        // Filter by district if available (via seller's TIN record)
        let pricesQuery = db
            .select({ unitPrice: transaction.unitPrice })
            .from(transaction)
            .where(
                and(
                    eq(transaction.productId, productId),
                    inArray(transaction.status, ["confirmed", "completed"]),
                    gte(transaction.createdAt, ninetyDaysAgo),
                ),
            );

        // If we have a district, further filter to transactions from sellers in that district
        if (district) {
            // Get all seller user IDs in this district from TIN DB
            const districtTins = await tinDb
                .select({ tinNumber: tinRecord.tinNumber })
                .from(tinRecord)
                .where(eq(tinRecord.district, district));

            if (districtTins.length > 0) {
                const tinNumbers = districtTins.map((t) => t.tinNumber);

                // Get user IDs for these TINs
                const districtUsers = await db
                    .select({ id: user.id })
                    .from(user)
                    .where(inArray(user.tinNumber, tinNumbers));

                if (districtUsers.length > 0) {
                    const userIds = districtUsers.map((u) => u.id);
                    pricesQuery = db
                        .select({ unitPrice: transaction.unitPrice })
                        .from(transaction)
                        .where(
                            and(
                                eq(transaction.productId, productId),
                                inArray(transaction.status, ["confirmed", "completed"]),
                                gte(transaction.createdAt, ninetyDaysAgo),
                                inArray(transaction.sellerId, userIds),
                            ),
                        );
                }
            }
        }

        const prices = await pricesQuery;

        if (prices.length === 0) return null;

        // Calculate median
        const sorted = prices.map((p) => p.unitPrice).sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
            ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
            : sorted[mid];
    } catch (error) {
        console.error("Failed to get historical median:", error);
        return null;
    }
}

/**
 * Peer median: P25–P75 percentile range median of what other merchants
 * in the same district are charging for this product.
 */
async function getPeerMedian(
    productId: string,
    sellerUserId: string,
    district: string | null,
): Promise<number | null> {
    try {
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

        // Build base query — exclude the current seller's transactions
        const baseConditions = [
            eq(transaction.productId, productId),
            inArray(transaction.status, ["confirmed", "completed"]),
            gte(transaction.createdAt, ninetyDaysAgo),
            sql`${transaction.sellerId} != ${sellerUserId}`,
        ];

        // Filter by district if available
        if (district) {
            const districtTins = await tinDb
                .select({ tinNumber: tinRecord.tinNumber })
                .from(tinRecord)
                .where(eq(tinRecord.district, district));

            if (districtTins.length > 0) {
                const tinNumbers = districtTins.map((t) => t.tinNumber);
                const districtUsers = await db
                    .select({ id: user.id })
                    .from(user)
                    .where(inArray(user.tinNumber, tinNumbers));

                if (districtUsers.length > 0) {
                    const peerIds = districtUsers
                        .map((u) => u.id)
                        .filter((id) => id !== sellerUserId);

                    if (peerIds.length > 0) {
                        baseConditions.push(inArray(transaction.sellerId, peerIds));
                    }
                }
            }
        }

        const prices = await db
            .select({ unitPrice: transaction.unitPrice })
            .from(transaction)
            .where(and(...baseConditions));

        if (prices.length === 0) return null;

        // P25–P75 percentile range → take the median of that range
        const sorted = prices.map((p) => p.unitPrice).sort((a, b) => a - b);
        const p25Idx = Math.floor(sorted.length * 0.25);
        const p75Idx = Math.floor(sorted.length * 0.75);
        const interquartile = sorted.slice(p25Idx, p75Idx + 1);

        if (interquartile.length === 0) return sorted[Math.floor(sorted.length / 2)];

        const mid = Math.floor(interquartile.length / 2);
        return interquartile.length % 2 === 0
            ? Math.round((interquartile[mid - 1] + interquartile[mid]) / 2)
            : interquartile[mid];
    } catch (error) {
        console.error("Failed to get peer median:", error);
        return null;
    }
}

/** Count total data points for this product in this district. */
async function getDataPointCount(
    productId: string,
    district: string | null,
): Promise<number> {
    try {
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

        const conditions = [
            eq(transaction.productId, productId),
            inArray(transaction.status, ["confirmed", "completed"]),
            gte(transaction.createdAt, ninetyDaysAgo),
        ];

        if (district) {
            const districtTins = await tinDb
                .select({ tinNumber: tinRecord.tinNumber })
                .from(tinRecord)
                .where(eq(tinRecord.district, district));

            if (districtTins.length > 0) {
                const tinNumbers = districtTins.map((t) => t.tinNumber);
                const districtUsers = await db
                    .select({ id: user.id })
                    .from(user)
                    .where(inArray(user.tinNumber, tinNumbers));

                if (districtUsers.length > 0) {
                    conditions.push(
                        inArray(transaction.sellerId, districtUsers.map((u) => u.id)),
                    );
                }
            }
        }

        const [result] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(transaction)
            .where(and(...conditions));

        return result?.count ?? 0;
    } catch (error) {
        console.error("Failed to get data point count:", error);
        return 0;
    }
}
