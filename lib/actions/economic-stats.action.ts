"use server";

import { sql, eq, gte, desc } from "drizzle-orm";
import db from "@/db/drizzle";
import { transaction, product, user, vatRecord, stock } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// National Economic Intelligence — aggregate analytics
// ---------------------------------------------------------------------------

export interface EconomicStatsData {
    topProducts: {
        name: string;
        volume: number;
        value: number;
        avgPrice: number;
    }[];
    sectorActivity: {
        role: string;
        label: string;
        traderCount: number;
        transactionCount: number;
        totalValue: number;
        vatGenerated: number;
    }[];
    priceChanges: {
        productName: string;
        currentAvg: number;
        previousAvg: number;
        changePercent: number;
    }[];
    stockOverview: {
        totalProducts: number;
        totalQuantity: number;
        negativeStockProducts: number;
    };
}

/**
 * Compute national economic intelligence metrics.
 */
export async function getEconomicStats(): Promise<EconomicStatsData> {
    await requireRRASession("super_admin", "reporting_officer", "director_executive", "data_ai_analyst");

    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

        // 1. Top products by transaction volume (last 30 days)
        const topProducts = await db
            .select({
                name: product.name,
                volume: sql<number>`COALESCE(SUM(${transaction.quantity}), 0)::int`.as("volume"),
                value: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`.as("value"),
                avgPrice: sql<number>`COALESCE(AVG(${transaction.unitPrice}), 0)`.as("avg_price"),
            })
            .from(transaction)
            .innerJoin(product, eq(transaction.productId, product.id))
            .where(gte(transaction.createdAt, thirtyDaysAgo))
            .groupBy(product.name)
            .orderBy(desc(sql`value`))
            .limit(8);

        // 2. Sector activity (by role)
        const ROLE_LABELS: Record<string, string> = {
            manufacturer: "Manufacturing",
            wholesaler: "Wholesale",
            retailer: "Retail",
        };

        const sectorTxns = await db
            .select({
                role: user.role,
                traderCount: sql<number>`COUNT(DISTINCT ${transaction.sellerId})::int`.as("trader_count"),
                txnCount: sql<number>`COUNT(*)::int`.as("txn_count"),
                totalValue: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`.as("total_value"),
            })
            .from(transaction)
            .innerJoin(user, eq(transaction.sellerId, user.id))
            .where(gte(transaction.createdAt, thirtyDaysAgo))
            .groupBy(user.role);

        const sectorVat = await db
            .select({
                role: user.role,
                vatTotal: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as("vat_total"),
            })
            .from(vatRecord)
            .innerJoin(user, eq(vatRecord.businessId, user.id))
            .where(sql`${vatRecord.vatType} = 'output' AND ${vatRecord.createdAt} >= ${thirtyDaysAgo}`)
            .groupBy(user.role);

        const vatByRole = new Map(sectorVat.map((s) => [s.role, Number(s.vatTotal) || 0]));

        const sectorActivity = sectorTxns.map((s) => ({
            role: s.role,
            label: ROLE_LABELS[s.role] ?? s.role,
            traderCount: s.traderCount,
            transactionCount: s.txnCount,
            totalValue: Number(s.totalValue) || 0,
            vatGenerated: vatByRole.get(s.role) ?? 0,
        })).sort((a, b) => b.totalValue - a.totalValue);

        // 3. Price inflation trends (current 30d vs previous 30d)
        const currentPrices = await db
            .select({
                productId: transaction.productId,
                productName: product.name,
                avgPrice: sql<number>`AVG(${transaction.unitPrice})`.as("avg_price"),
            })
            .from(transaction)
            .innerJoin(product, eq(transaction.productId, product.id))
            .where(gte(transaction.createdAt, thirtyDaysAgo))
            .groupBy(transaction.productId, product.name);

        const previousPrices = await db
            .select({
                productId: transaction.productId,
                avgPrice: sql<number>`AVG(${transaction.unitPrice})`.as("avg_price"),
            })
            .from(transaction)
            .where(sql`${transaction.createdAt} >= ${sixtyDaysAgo} AND ${transaction.createdAt} < ${thirtyDaysAgo}`)
            .groupBy(transaction.productId);

        const prevMap = new Map(previousPrices.map((p) => [p.productId, p.avgPrice]));

        const priceChanges = currentPrices
            .map((c) => {
                const prev = prevMap.get(c.productId);
                if (!prev || prev === 0) return null;
                const changePercent = Math.round(((c.avgPrice - prev) / prev) * 100);
                return {
                    productName: c.productName,
                    currentAvg: Math.round(c.avgPrice),
                    previousAvg: Math.round(prev),
                    changePercent,
                };
            })
            .filter((p): p is NonNullable<typeof p> => p !== null)
            .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
            .slice(0, 5);

        // 4. Stock overview
        const [stockOverview] = await db
            .select({
                totalProducts: sql<number>`COUNT(DISTINCT ${stock.productId})::int`.as("total_products"),
                totalQuantity: sql<number>`COALESCE(SUM(${stock.quantity}), 0)::int`.as("total_qty"),
                negativeStockProducts: sql<number>`COUNT(CASE WHEN ${stock.quantity} < 0 THEN 1 END)::int`.as("neg_stock"),
            })
            .from(stock);

        return {
            topProducts: topProducts.map((p) => ({
                name: p.name,
                volume: p.volume,
                value: p.value,
                avgPrice: Math.round(p.avgPrice),
            })),
            sectorActivity,
            priceChanges,
            stockOverview: {
                totalProducts: stockOverview?.totalProducts ?? 0,
                totalQuantity: stockOverview?.totalQuantity ?? 0,
                negativeStockProducts: stockOverview?.negativeStockProducts ?? 0,
            },
        };
    } catch (error) {
        console.error("Economic stats error:", error);
        return { topProducts: [], sectorActivity: [], priceChanges: [], stockOverview: { totalProducts: 0, totalQuantity: 0, negativeStockProducts: 0 } };
    }
}
