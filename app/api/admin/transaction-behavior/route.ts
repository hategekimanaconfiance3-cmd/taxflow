import { NextResponse } from 'next/server';
import { requireRRASession } from '@/lib/auth-guard';
import db from '@/db/drizzle';
import { transaction, user } from '@/db/schema';
import { sql, gte, eq, desc } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';

export const dynamic = 'force-dynamic';

export interface HourlyBucket {
  hour: number;   // 0–23
  label: string;  // "08:00", "14:00"
  count: number;
  value: number;
}

export interface TopTraderActivity {
  businessName: string;
  tinNumber: string | null;
  txnCount: number;
  totalValue: number;
  avgValue: number;
}

export interface DailyBucket {
  date: string;   // "Apr 01"
  count: number;
  value: number;
}

export interface TransactionBehaviorData {
  // Totals
  totalToday: number;
  totalThisWeek: number;
  avgDailyVolume: number;           // weekly avg
  avgTransactionValue: number;      // all-time
  avgTransactionsPerTrader: number;

  // Peak hours (last 7 days)
  peakHours: HourlyBucket[];
  peakHour: number;                 // most active hour

  // 30-day daily trend
  dailyTrend: DailyBucket[];

  // Top traders by activity
  topActiveTraders: TopTraderActivity[];

  // Insights
  insights: string[];
}

const computeBehavior = unstable_cache(
  async (): Promise<TransactionBehaviorData> => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // 1. Hourly distribution (last 7 days)
    const hourlyRows = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${transaction.createdAt})::int`.as('hour'),
        count: sql<number>`COUNT(*)::int`.as('count'),
        value: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`.as('value'),
      })
      .from(transaction)
      .where(gte(transaction.createdAt, sevenDaysAgo))
      .groupBy(sql`EXTRACT(HOUR FROM ${transaction.createdAt})`)
      .orderBy(sql`EXTRACT(HOUR FROM ${transaction.createdAt})`);

    // Build full 24-hour array
    const hourMap = new Map(hourlyRows.map((r) => [r.hour, r]));
    const peakHours: HourlyBucket[] = Array.from({ length: 24 }, (_, h) => {
      const row = hourMap.get(h);
      const label = `${String(h).padStart(2, '0')}:00`;
      return { hour: h, label, count: row?.count ?? 0, value: row?.value ?? 0 };
    });

    const peakHour = peakHours.reduce((best, h) => (h.count > best.count ? h : best), peakHours[0]).hour;

    // 2. 30-day daily trend
    const dailyRows = await db
      .select({
        dateStr: sql<string>`TO_CHAR(${transaction.createdAt}, 'Mon DD')`.as('date_str'),
        dateSort: sql<string>`DATE(${transaction.createdAt})`.as('date_sort'),
        count: sql<number>`COUNT(*)::int`.as('count'),
        value: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`.as('value'),
      })
      .from(transaction)
      .where(gte(transaction.createdAt, thirtyDaysAgo))
      .groupBy(sql`DATE(${transaction.createdAt}), TO_CHAR(${transaction.createdAt}, 'Mon DD')`)
      .orderBy(sql`DATE(${transaction.createdAt})`);

    const dailyTrend: DailyBucket[] = dailyRows.map((r) => ({
      date: r.dateStr,
      count: r.count,
      value: Number(r.value) || 0,
    }));

    // 3. Today / week totals
    const [todayRow] = await db
      .select({ count: sql<number>`COUNT(*)::int`.as('c') })
      .from(transaction)
      .where(sql`${transaction.createdAt} >= CURRENT_DATE`);

    const [weekRow] = await db
      .select({
        count: sql<number>`COUNT(*)::int`.as('c'),
        totalValue: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`.as('v'),
      })
      .from(transaction)
      .where(gte(transaction.createdAt, sevenDaysAgo));

    // 3. All-time average transaction value
    const [avgRow] = await db
      .select({
        avg: sql<number>`COALESCE(AVG(${transaction.totalAmount}), 0)`.as('avg'),
        total: sql<number>`COUNT(*)::int`.as('total'),
      })
      .from(transaction);

    // 4. Active trader count (last 7 days)
    const [activeTraderRow] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${transaction.sellerId})::int`.as('c') })
      .from(transaction)
      .where(gte(transaction.createdAt, sevenDaysAgo));

    // 5. Top active traders (last 7 days)
    const topTraders = await db
      .select({
        businessName: user.businessName,
        tinNumber: user.tinNumber,
        txnCount: sql<number>`COUNT(*)::int`.as('txn_count'),
        totalValue: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`.as('total_value'),
        avgValue: sql<number>`COALESCE(AVG(${transaction.totalAmount}), 0)`.as('avg_value'),
      })
      .from(transaction)
      .innerJoin(user, eq(transaction.sellerId, user.id))
      .where(gte(transaction.createdAt, sevenDaysAgo))
      .groupBy(user.businessName, user.tinNumber)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(5);

    const weekCount = weekRow?.count ?? 0;
    const activeTraderCount = Math.max(activeTraderRow?.count ?? 1, 1);
    const avgTxnValue = Math.round(avgRow?.avg ?? 0);
    const avgDailyVolume = Math.round(weekCount / 7);
    const todayCount = todayRow?.count ?? 0;

    // Generate insights
    const insights: string[] = [];

    // Peak hour insight
    const peakLabel = `${String(peakHour).padStart(2, '0')}:00–${String(peakHour + 1).padStart(2, '0')}:00`;
    const peakCount = peakHours[peakHour]?.count ?? 0;
    if (peakCount > 0) {
      insights.push(`Peak activity at ${peakLabel} — highest transaction concentration`);
    }

    // Daily average
    if (avgDailyVolume > 0) {
      if (todayCount < avgDailyVolume * 0.5) {
        insights.push(`⚠️ Today's volume (${todayCount}) is below daily average (${avgDailyVolume})`);
      } else if (todayCount > avgDailyVolume * 1.5) {
        insights.push(`✅ High activity day — ${todayCount} transactions vs avg ${avgDailyVolume}`);
      }
    }

    // Avg value context
    if (avgTxnValue > 0) {
      insights.push(`Average transaction value: ${avgTxnValue.toLocaleString()} RWF across all periods`);
    }

    // Per-trader context
    const txnPerTrader = Math.round(weekCount / activeTraderCount);
    if (txnPerTrader > 0) {
      insights.push(`${txnPerTrader} transactions per active trader this week (${activeTraderCount} active)`);
    }

    return {
      totalToday: todayCount,
      totalThisWeek: weekCount,
      avgDailyVolume,
      avgTransactionValue: avgTxnValue,
      avgTransactionsPerTrader: txnPerTrader,
      peakHours,
      peakHour,
      dailyTrend,
      topActiveTraders: topTraders.map((t) => ({
        businessName: t.businessName ?? 'Unknown',
        tinNumber: t.tinNumber ?? null,
        txnCount: t.txnCount,
        totalValue: t.totalValue,
        avgValue: Math.round(t.avgValue),
      })),
      insights,
    };
  },
  ['transaction-behavior'],
  { revalidate: 300 },
);

export async function GET(): Promise<NextResponse> {
  try {
    await requireRRASession();
    const data = await computeBehavior();
    return NextResponse.json(data);
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
}
