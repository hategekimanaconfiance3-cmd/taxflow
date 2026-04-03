import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import db from '@/db/drizzle';
import { transaction, vatRecord, user } from '@/db/schema';
import { sql, gte, and, eq } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';

export const dynamic = 'force-dynamic';

export interface VatMonthPoint {
  month: string;       // "Jan", "Feb", …
  period: string;      // "2026-01"
  vatCollected: number;
  txnCount: number;
}

export interface VatPerformanceData {
  monthly: VatMonthPoint[];
  totalVatCollected: number;         // last 12 months
  totalVatPrevPeriod: number;        // previous 12 months
  pctChange: number | null;          // null = no prior data
  avgMonthlyVat: number;
  peakMonth: string | null;
  currentMonthVat: number;
  currentMonthChange: number | null; // vs same month last year
}

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const fetchVatPerformance = unstable_cache(
  async (): Promise<VatPerformanceData> => {
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const twentyFourMonthsAgo = new Date(now.getFullYear() - 2, now.getMonth(), 1);

    // Monthly VAT from transactions (last 12 months)
    const monthlyRows = await db
      .select({
        period: sql<string>`TO_CHAR(DATE_TRUNC('month', ${transaction.createdAt}), 'YYYY-MM')`,
        vatCollected: sql<number>`COALESCE(SUM(${transaction.vatAmount}), 0)::float8`,
        txnCount: sql<number>`COUNT(*)::int`,
      })
      .from(transaction)
      .where(gte(transaction.createdAt, twelveMonthsAgo))
      .groupBy(sql`DATE_TRUNC('month', ${transaction.createdAt})`)
      .orderBy(sql`DATE_TRUNC('month', ${transaction.createdAt}) ASC`);

    // Previous 12-month total for comparison
    const [prevTotal] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${transaction.vatAmount}), 0)::float8`,
      })
      .from(transaction)
      .where(and(
        gte(transaction.createdAt, twentyFourMonthsAgo),
        sql`${transaction.createdAt} < ${twelveMonthsAgo}`,
      ));

    const monthly: VatMonthPoint[] = monthlyRows.map((r) => {
      const [year, month] = r.period.split('-');
      return {
        month: MONTH_LABELS[parseInt(month) - 1] ?? r.period,
        period: r.period,
        vatCollected: Number(r.vatCollected),
        txnCount: r.txnCount,
      };
    });

    const totalVat = monthly.reduce((s, m) => s + m.vatCollected, 0);
    const prevTotalVat = Number(prevTotal?.total ?? 0);
    const pctChange = prevTotalVat > 0
      ? Math.round(((totalVat - prevTotalVat) / prevTotalVat) * 100)
      : null;

    const peakPoint = monthly.reduce<VatMonthPoint | null>(
      (best, m) => (!best || m.vatCollected > best.vatCollected ? m : best),
      null,
    );

    // Current month stats
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const sameMonthLastYear = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentMonthVat = monthly.find((m) => m.period === currentPeriod)?.vatCollected ?? 0;
    const lastYearMonthVat = monthly.find((m) => m.period === sameMonthLastYear)?.vatCollected ?? null;
    const currentMonthChange = lastYearMonthVat && lastYearMonthVat > 0
      ? Math.round(((currentMonthVat - lastYearMonthVat) / lastYearMonthVat) * 100)
      : null;

    return {
      monthly,
      totalVatCollected: totalVat,
      totalVatPrevPeriod: prevTotalVat,
      pctChange,
      avgMonthlyVat: monthly.length > 0 ? Math.round(totalVat / monthly.length) : 0,
      peakMonth: peakPoint?.month ?? null,
      currentMonthVat,
      currentMonthChange,
    };
  },
  ['vat-performance'],
  { revalidate: 300 },
);

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const data = await fetchVatPerformance();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  } catch (error) {
    console.error('VAT performance API error:', error);
    return NextResponse.json({ error: 'Failed to load VAT performance' }, { status: 500 });
  }
}
