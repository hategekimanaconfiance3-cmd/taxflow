"use server";

import { eq, and, sql, inArray } from "drizzle-orm";
import db from "@/db/drizzle";
import { transaction, stock, vatRecord, auditLog } from "@/db/schema";
import { requireTraderSession } from "@/lib/auth-guard";

/**
 * Aggregated dashboard stats for the 7-card overview.
 * Combines production, sales, stock, and VAT data in minimal queries.
 */
export async function getDashboardStats() {
    const session = await requireTraderSession();
    const userId = session.user.id;
    const role = session.user.role;

    // 1. Total stock (remaining)
    const stockResult = await db
        .select({
            totalQuantity: sql<number>`COALESCE(SUM(${stock.quantity}), 0)`.as(
                "total_quantity",
            ),
            productCount: sql<number>`COUNT(*)`.as("product_count"),
        })
        .from(stock)
        .where(eq(stock.businessId, userId));

    const remainingStock = Number(stockResult[0]?.totalQuantity) || 0;
    const productCount = Number(stockResult[0]?.productCount) || 0;

    // 2. Transaction aggregates (sold, sales value)
    const salesResult = await db
        .select({
            totalSold: sql<number>`COALESCE(SUM(${transaction.quantity}), 0)`.as(
                "total_sold",
            ),
            totalSalesValue:
                sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`.as(
                    "total_sales_value",
                ),
            txnCount: sql<number>`COUNT(*)`.as("txn_count"),
        })
        .from(transaction)
        .where(
            and(
                eq(transaction.sellerId, userId),
                inArray(transaction.status, ["confirmed", "completed"]),
            ),
        );

    const totalSold = Number(salesResult[0]?.totalSold) || 0;
    const totalSalesValue = Number(salesResult[0]?.totalSalesValue) || 0;

    // 3. Total produced = remaining stock + total sold
    const totalProduced = remainingStock + totalSold;

    // 4. VAT aggregates
    const vatResult = await db
        .select({
            vatType: vatRecord.vatType,
            total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as(
                "total",
            ),
        })
        .from(vatRecord)
        .where(eq(vatRecord.businessId, userId))
        .groupBy(vatRecord.vatType);

    const taxGenerated =
        Number(vatResult.find((r) => r.vatType === "output")?.total) || 0;
    const taxPaid = Number(vatResult.find((r) => r.vatType === "input")?.total) || 0;
    const taxBalance = taxGenerated - taxPaid;

    // 5. Pending counts
    const pendingResult = await db
        .select({
            pendingIncoming:
                sql<number>`COUNT(*) FILTER (WHERE ${transaction.buyerId} = ${userId} AND ${transaction.status} = 'pending')`.as(
                    "pending_incoming",
                ),
            pendingOutgoing:
                sql<number>`COUNT(*) FILTER (WHERE ${transaction.sellerId} = ${userId} AND ${transaction.status} = 'pending')`.as(
                    "pending_outgoing",
                ),
        })
        .from(transaction)
        .where(
            sql`(${transaction.buyerId} = ${userId} OR ${transaction.sellerId} = ${userId}) AND ${transaction.status} = 'pending'`,
        );

    return {
        totalProduced,
        totalSold,
        remainingStock,
        totalSalesValue,
        taxGenerated,
        taxPaid,
        taxBalance,
        productCount,
        pendingIncoming: Number(pendingResult[0]?.pendingIncoming) || 0,
        pendingOutgoing: Number(pendingResult[0]?.pendingOutgoing) || 0,
    };
}

/**
 * Monthly data for charts — current month + previous month only.
 * Always returns exactly 2 entries so both bars are visible.
 */
export async function getMonthlyStats() {
    const session = await requireTraderSession();
    const userId = session.user.id;

    // Build the two month labels (previous + current)
    const now = new Date();
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const months = [prevDate, now].map((d) => ({
        month: d.toLocaleString("en-US", { month: "short" }),
        monthNum: d.getMonth() + 1,
        year: d.getFullYear(),
    }));

    // Date range: start of previous month → now
    const rangeStart = prevDate.toISOString();

    // Monthly production — from audit log PRODUCTION_RECORDED entries
    const rawProduction = await db
        .select({
            month: sql<string>`TO_CHAR(${auditLog.createdAt}, 'Mon')`.as("month"),
            monthNum: sql<number>`EXTRACT(MONTH FROM ${auditLog.createdAt})`.as("month_num"),
            total: sql<number>`COALESCE(SUM((${auditLog.metadata}::jsonb->>'quantity')::int), 0)`.as("total"),
        })
        .from(auditLog)
        .where(
            and(
                eq(auditLog.userId, userId),
                eq(auditLog.action, "PRODUCTION_RECORDED"),
                sql`${auditLog.createdAt} >= ${rangeStart}`,
            ),
        )
        .groupBy(
            sql`TO_CHAR(${auditLog.createdAt}, 'Mon')`,
            sql`EXTRACT(MONTH FROM ${auditLog.createdAt})`,
        )
        .orderBy(sql`EXTRACT(MONTH FROM ${auditLog.createdAt})`);

    // Monthly sales value
    const rawSales = await db
        .select({
            month: sql<string>`TO_CHAR(${transaction.createdAt}, 'Mon')`.as("month"),
            monthNum: sql<number>`EXTRACT(MONTH FROM ${transaction.createdAt})`.as("month_num"),
            total: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`.as("total"),
        })
        .from(transaction)
        .where(
            and(
                eq(transaction.sellerId, userId),
                inArray(transaction.status, ["confirmed", "completed"]),
                sql`${transaction.createdAt} >= ${rangeStart}`,
            ),
        )
        .groupBy(
            sql`TO_CHAR(${transaction.createdAt}, 'Mon')`,
            sql`EXTRACT(MONTH FROM ${transaction.createdAt})`,
        )
        .orderBy(sql`EXTRACT(MONTH FROM ${transaction.createdAt})`);

    // Fill both months — ensure every month appears even with 0
    const monthlyProduction = months.map((m) => {
        const found = rawProduction.find((r) => Number(r.monthNum) === m.monthNum);
        return { month: m.month, total: Number(found?.total) || 0 };
    });

    const monthlySales = months.map((m) => {
        const found = rawSales.find((r) => Number(r.monthNum) === m.monthNum);
        return { month: m.month, total: Number(found?.total) || 0 };
    });

    return {
        monthlyProduction,
        monthlySales,
    };
}
