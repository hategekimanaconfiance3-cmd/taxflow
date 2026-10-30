import { requireAnyRRAPermission } from "@/lib/auth-guard";
import { hasRRAPermission } from "@/lib/rra-rbac";
import db from "@/db/drizzle";
import { transaction, user } from "@/db/schema";
import { sql, desc } from "drizzle-orm";

export interface HourlyBucket {
    hour: number;
    count: number;
    totalAmount: number;
}

export interface TopTraderActivity {
    businessId: string;
    businessName: string;
    txCount: number;
    totalAmount: number;
}

export interface TransactionBehaviorData {
    hourlyBuckets: HourlyBucket[];
    topTraders: TopTraderActivity[];
    totalTransactions: number;
    totalAmount: number;
    avgTransactionValue: number;
}

export async function GET() {
    const { staff } = await requireAnyRRAPermission("analytics.read", "reports.aggregate.read");
    const canReadTraderTransactions = staff.clearanceRoles.some((role) => hasRRAPermission(role, "transaction.read"));

    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [hourly, topTraders, summary] = await Promise.all([
            db.select({
                hour: sql<number>`EXTRACT(HOUR FROM ${transaction.createdAt})::int`.as("hour"),
                count: sql<number>`COUNT(*)`.as("count"),
                totalAmount: sql<number>`COALESCE(SUM(${transaction.totalAmount}),0)::float8`.as("totalAmount"),
            })
            .from(transaction)
            .where(sql`${transaction.createdAt} >= ${thirtyDaysAgo}`)
            .groupBy(sql`EXTRACT(HOUR FROM ${transaction.createdAt})`),

            canReadTraderTransactions ? db.select({
                businessId: transaction.sellerId,
                businessName: user.businessName,
                txCount: sql<number>`COUNT(*)`.as("txCount"),
                totalAmount: sql<number>`COALESCE(SUM(${transaction.totalAmount}),0)::float8`.as("totalAmount"),
            })
            .from(transaction)
            .innerJoin(user, sql`${user.id} = ${transaction.sellerId}`)
            .where(sql`${transaction.createdAt} >= ${thirtyDaysAgo}`)
            .groupBy(transaction.sellerId, user.businessName)
            .orderBy(desc(sql`COUNT(*)`))
            .limit(5) : Promise.resolve([]),

            db.select({
                total: sql<number>`COUNT(*)`.as("total"),
                amount: sql<number>`COALESCE(SUM(${transaction.totalAmount}),0)::float8`.as("amount"),
            })
            .from(transaction)
            .where(sql`${transaction.createdAt} >= ${thirtyDaysAgo}`),
        ]);

        // Fill all 24 hours
        const hourMap = new Map(hourly.map((h) => [h.hour, h]));
        const hourlyBuckets: HourlyBucket[] = Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            count: hourMap.get(i)?.count ?? 0,
            totalAmount: hourMap.get(i)?.totalAmount ?? 0,
        }));

        const totalTransactions = summary[0]?.total ?? 0;
        const totalAmount = summary[0]?.amount ?? 0;

        return Response.json({
            hourlyBuckets,
            topTraders: topTraders.map((t) => ({ ...t, businessName: t.businessName ?? t.businessId })),
            totalTransactions,
            totalAmount,
            avgTransactionValue: totalTransactions > 0 ? totalAmount / totalTransactions : 0,
        } satisfies TransactionBehaviorData);
    } catch (err) {
        console.error("[transaction-behavior]", err);
        return Response.json({
            hourlyBuckets: Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0, totalAmount: 0 })),
            topTraders: [],
            totalTransactions: 0,
            totalAmount: 0,
            avgTransactionValue: 0,
        } satisfies TransactionBehaviorData);
    }
}
