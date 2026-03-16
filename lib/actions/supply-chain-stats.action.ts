"use server";

import { sql, and, eq, gte } from "drizzle-orm";
import db from "@/db/drizzle";
import { transaction, stock, user, product } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// Supply Chain Stats — product flow across Manufacturer → Wholesaler → Retailer
// ---------------------------------------------------------------------------

export interface SupplyChainData {
    productsInCirculation: number;
    totalStockMovementToday: number;
    unverifiedTransactions: number;
    pendingConfirmations: number;
    flowSummary: {
        label: string;
        count: number;
        value: number;
    }[];
    topProducts: {
        name: string;
        totalQuantity: number;
        totalValue: number;
        txnCount: number;
    }[];
}

/**
 * Compute supply chain overview stats.
 */
export async function getSupplyChainStats(): Promise<SupplyChainData> {
    await requireRRASession();

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        // 1. Products with active stock (in circulation)
        const [productsResult] = await db
            .select({
                count: sql<number>`COUNT(DISTINCT ${stock.productId})::int`.as("count"),
            })
            .from(stock)
            .where(sql`${stock.quantity} > 0`);

        // 2. Stock movement today (transactions created today)
        const [todayMovement] = await db
            .select({
                count: sql<number>`COUNT(*)::int`.as("count"),
                totalValue: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)`.as("total"),
            })
            .from(transaction)
            .where(gte(transaction.createdAt, today));

        // 3. Unverified/pending transactions
        const [pending] = await db
            .select({
                count: sql<number>`COUNT(*)::int`.as("count"),
            })
            .from(transaction)
            .where(eq(transaction.status, "pending"));

        // 4. Flow summary: transactions by role pair (seller_role → buyer_role)
        const flowData = await db
            .select({
                sellerRole: sql<string>`seller_user.role`.as("seller_role"),
                buyerRole: sql<string>`COALESCE(buyer_user.role, 'consumer')`.as("buyer_role"),
                count: sql<number>`COUNT(*)::int`.as("count"),
                totalValue: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)`.as("total_value"),
            })
            .from(transaction)
            .innerJoin(sql`"user" AS seller_user`, sql`seller_user.id = ${transaction.sellerId}`)
            .leftJoin(sql`"user" AS buyer_user`, sql`buyer_user.id = ${transaction.buyerId}`)
            .where(gte(transaction.createdAt, sevenDaysAgo))
            .groupBy(sql`seller_user.role`, sql`COALESCE(buyer_user.role, 'consumer')`);

        const ROLE_LABELS: Record<string, string> = {
            manufacturer: "Manufacturer",
            wholesaler: "Wholesaler",
            retailer: "Retailer",
            consumer: "Consumer",
        };

        const flowSummary = flowData.map((f) => ({
            label: `${ROLE_LABELS[f.sellerRole] ?? f.sellerRole} → ${ROLE_LABELS[f.buyerRole] ?? f.buyerRole}`,
            count: f.count,
            value: f.totalValue,
        })).sort((a, b) => b.value - a.value);

        // 5. Top products by transaction volume (last 7 days)
        const topProducts = await db
            .select({
                name: product.name,
                totalQuantity: sql<number>`COALESCE(SUM(${transaction.quantity}), 0)::int`.as("total_qty"),
                totalValue: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)`.as("total_value"),
                txnCount: sql<number>`COUNT(*)::int`.as("txn_count"),
            })
            .from(transaction)
            .innerJoin(product, eq(transaction.productId, product.id))
            .where(gte(transaction.createdAt, sevenDaysAgo))
            .groupBy(product.name)
            .orderBy(sql`total_value DESC`)
            .limit(5);

        return {
            productsInCirculation: productsResult?.count ?? 0,
            totalStockMovementToday: todayMovement?.count ?? 0,
            unverifiedTransactions: todayMovement?.count ?? 0,
            pendingConfirmations: pending?.count ?? 0,
            flowSummary,
            topProducts: topProducts.map((p) => ({
                name: p.name,
                totalQuantity: p.totalQuantity,
                totalValue: p.totalValue,
                txnCount: p.txnCount,
            })),
        };
    } catch (error) {
        console.error("Supply chain stats error:", error);
        return {
            productsInCirculation: 0,
            totalStockMovementToday: 0,
            unverifiedTransactions: 0,
            pendingConfirmations: 0,
            flowSummary: [],
            topProducts: [],
        };
    }
}
