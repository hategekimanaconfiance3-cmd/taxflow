import { requireAnyRRAPermission } from "@/lib/auth-guard";
import { hasRRAPermission } from "@/lib/rra-rbac";
import db from "@/db/drizzle";
import { transaction, user } from "@/db/schema";
import { sql, desc } from "drizzle-orm";

export interface HourlyBucket {
    hour: number;
    label: string;
    count: number;
    totalAmount: number;
}

export interface DailyTransactionPoint {
    date: string;
    count: number;
    totalAmount: number;
}

export interface TopTraderActivity {
    businessId: string;
    businessName: string;
    tinNumber: string | null;
    txCount: number;
    txnCount: number;
    totalAmount: number;
    avgValue: number;
}

export interface TransactionBehaviorData {
    hourlyBuckets: HourlyBucket[];
    peakHours: HourlyBucket[];
    peakHour: number;
    dailyTrend: DailyTransactionPoint[];
    topTraders: TopTraderActivity[];
    topActiveTraders: TopTraderActivity[];
    totalTransactions: number;
    totalThisWeek: number;
    totalToday: number;
    avgDailyVolume: number;
    avgTransactionsPerTrader: number;
    totalAmount: number;
    avgTransactionValue: number;
    insights: string[];
}

export async function GET() {
    const { staff } = await requireAnyRRAPermission("analytics.read", "reports.aggregate.read");
    const canReadTraderTransactions = staff.clearanceRoles.some((role) => hasRRAPermission(role, "transaction.read"));

    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [hourly, daily, topTraders, summary] = await Promise.all([
            db.select({
                hour: sql<number>`EXTRACT(HOUR FROM ${transaction.createdAt})::int`.as("hour"),
                count: sql<number>`COUNT(*)`.as("count"),
                totalAmount: sql<number>`COALESCE(SUM(${transaction.totalAmount}),0)::float8`.as("totalAmount"),
            })
            .from(transaction)
            .where(sql`${transaction.createdAt} >= ${thirtyDaysAgo}`)
            .groupBy(sql`EXTRACT(HOUR FROM ${transaction.createdAt})`),

            db.select({
                date: sql<string>`TO_CHAR(${transaction.createdAt}, 'YYYY-MM-DD')`.as("date"),
                count: sql<number>`COUNT(*)::int`.as("count"),
                totalAmount: sql<number>`COALESCE(SUM(${transaction.totalAmount}),0)::float8`.as("totalAmount"),
            })
            .from(transaction)
            .where(sql`${transaction.createdAt} >= ${thirtyDaysAgo}`)
            .groupBy(sql`TO_CHAR(${transaction.createdAt}, 'YYYY-MM-DD')`)
            .orderBy(sql`TO_CHAR(${transaction.createdAt}, 'YYYY-MM-DD')`),

            canReadTraderTransactions ? db.select({
                businessId: transaction.sellerId,
                businessName: user.businessName,
                tinNumber: user.tinNumber,
                txCount: sql<number>`COUNT(*)`.as("txCount"),
                totalAmount: sql<number>`COALESCE(SUM(${transaction.totalAmount}),0)::float8`.as("totalAmount"),
            })
            .from(transaction)
            .innerJoin(user, sql`${user.id} = ${transaction.sellerId}`)
            .where(sql`${transaction.createdAt} >= ${thirtyDaysAgo}`)
            .groupBy(transaction.sellerId, user.businessName, user.tinNumber)
            .orderBy(desc(sql`COUNT(*)`))
            .limit(5) : Promise.resolve([]),

            db.select({
                total: sql<number>`COUNT(*)`.as("total"),
                amount: sql<number>`COALESCE(SUM(${transaction.totalAmount}),0)::float8`.as("amount"),
                traderCount: sql<number>`COUNT(DISTINCT ${transaction.sellerId})::int`.as("traderCount"),
            })
            .from(transaction)
            .where(sql`${transaction.createdAt} >= ${thirtyDaysAgo}`),
        ]);

        // Fill all 24 hours
        const hourMap = new Map(hourly.map((h) => [h.hour, h]));
        const hourlyBuckets: HourlyBucket[] = Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            label: `${String(i).padStart(2, "0")}:00`,
            count: hourMap.get(i)?.count ?? 0,
            totalAmount: hourMap.get(i)?.totalAmount ?? 0,
        }));

        const dailyTrend: DailyTransactionPoint[] = daily.map((point) => ({
            date: point.date,
            count: point.count,
            totalAmount: point.totalAmount,
        }));
        const today = new Date().toISOString().slice(0, 10);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        const weekStart = sevenDaysAgo.toISOString().slice(0, 10);
        const totalToday = dailyTrend.find((point) => point.date === today)?.count ?? 0;
        const totalThisWeek = dailyTrend.filter((point) => point.date >= weekStart).reduce((sum, point) => sum + point.count, 0);
        const peakHour = hourlyBuckets.reduce((best, bucket) => bucket.count > hourlyBuckets[best].count ? bucket.hour : best, 0);

        const totalTransactions = summary[0]?.total ?? 0;
        const totalAmount = summary[0]?.amount ?? 0;

        return Response.json({
            hourlyBuckets,
            peakHours: hourlyBuckets,
            peakHour,
            dailyTrend,
            topTraders: topTraders.map((t) => ({
                ...t,
                businessName: t.businessName ?? t.businessId,
                txnCount: t.txCount,
                avgValue: t.txCount > 0 ? t.totalAmount / t.txCount : 0,
            })),
            topActiveTraders: topTraders.map((t) => ({
                ...t,
                businessName: t.businessName ?? t.businessId,
                txnCount: t.txCount,
                avgValue: t.txCount > 0 ? t.totalAmount / t.txCount : 0,
            })),
            totalTransactions,
            totalThisWeek,
            totalToday,
            avgDailyVolume: totalTransactions / 30,
            avgTransactionsPerTrader: (summary[0]?.traderCount ?? 0) > 0 ? totalTransactions / summary[0]!.traderCount : 0,
            totalAmount,
            avgTransactionValue: totalTransactions > 0 ? totalAmount / totalTransactions : 0,
            insights: [],
        } satisfies TransactionBehaviorData);
    } catch (err) {
        console.error("[transaction-behavior]", err);
        return Response.json({
            hourlyBuckets: Array.from({ length: 24 }, (_, i) => ({ hour: i, label: `${String(i).padStart(2, "0")}:00`, count: 0, totalAmount: 0 })),
            peakHours: Array.from({ length: 24 }, (_, i) => ({ hour: i, label: `${String(i).padStart(2, "0")}:00`, count: 0, totalAmount: 0 })),
            peakHour: 0,
            dailyTrend: [],
            topTraders: [],
            topActiveTraders: [],
            totalTransactions: 0,
            totalThisWeek: 0,
            totalToday: 0,
            avgDailyVolume: 0,
            avgTransactionsPerTrader: 0,
            totalAmount: 0,
            avgTransactionValue: 0,
            insights: [],
        } satisfies TransactionBehaviorData);
    }
}
