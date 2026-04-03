import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import db from '@/db/drizzle';
import { transaction, user } from '@/db/schema';
import { sql, gte, and } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';

export const dynamic = 'force-dynamic';

export interface SectorPoint {
  role: string;
  label: string;
  vatContribution: number;    // RWF
  vatPct: number;             // % of total VAT
  txnCount: number;
  traderCount: number;
  avgTxnValue: number;
  growthPct: number | null;   // vs previous 30 days
}

export interface SectorAnalysisData {
  sectors: SectorPoint[];
  totalVat: number;
  topSector: string | null;
  fastestGrowingSector: string | null;
  period: string; // "Last 30 days"
}

const ROLE_LABELS: Record<string, string> = {
  manufacturer: 'Manufacturing',
  wholesaler: 'Wholesale',
  retailer: 'Retail',
};

const fetchSectorAnalysis = unstable_cache(
  async (): Promise<SectorAnalysisData> => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Current 30-day window per sector
    const current = await db
      .select({
        role: user.role,
        vatTotal: sql<number>`COALESCE(SUM(${transaction.vatAmount}), 0)::float8`,
        txnCount: sql<number>`COUNT(*)::int`,
        traderCount: sql<number>`COUNT(DISTINCT ${transaction.sellerId})::int`,
        avgValue: sql<number>`COALESCE(AVG(${transaction.totalAmount}), 0)::bigint`,
      })
      .from(transaction)
      .innerJoin(user, sql`${user.id} = ${transaction.sellerId}`)
      .where(and(
        gte(transaction.createdAt, thirtyDaysAgo),
        sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
      ))
      .groupBy(user.role);

    // Previous 30-day window for growth comparison
    const previous = await db
      .select({
        role: user.role,
        vatTotal: sql<number>`COALESCE(SUM(${transaction.vatAmount}), 0)::float8`,
      })
      .from(transaction)
      .innerJoin(user, sql`${user.id} = ${transaction.sellerId}`)
      .where(and(
        gte(transaction.createdAt, sixtyDaysAgo),
        sql`${transaction.createdAt} < ${thirtyDaysAgo}`,
        sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
      ))
      .groupBy(user.role);

    const prevMap = new Map(previous.map((p) => [p.role, Number(p.vatTotal) || 0]));
    const totalVat = current.reduce((s, c) => s + (Number(c.vatTotal) || 0), 0);

    const sectors: SectorPoint[] = current.map((c) => {
      const vatTotal = Number(c.vatTotal) || 0;
      const prevVat = prevMap.get(c.role) ?? 0;
      const growthPct = prevVat > 0
        ? Math.round(((vatTotal - prevVat) / prevVat) * 100)
        : null;
      return {
        role: c.role,
        label: ROLE_LABELS[c.role] ?? c.role,
        vatContribution: vatTotal,
        vatPct: totalVat > 0 ? Math.round((vatTotal / totalVat) * 100) : 0,
        txnCount: c.txnCount,
        traderCount: c.traderCount,
        avgTxnValue: Number(c.avgValue),
        growthPct,
      };
    }).sort((a, b) => b.vatContribution - a.vatContribution);

    // Ensure all 3 roles appear (fill missing with zero)
    for (const role of ['manufacturer', 'wholesaler', 'retailer']) {
      if (!sectors.find((s) => s.role === role)) {
        sectors.push({
          role,
          label: ROLE_LABELS[role] ?? role,
          vatContribution: 0,
          vatPct: 0,
          txnCount: 0,
          traderCount: 0,
          avgTxnValue: 0,
          growthPct: null,
        });
      }
    }
    sectors.sort((a, b) => b.vatContribution - a.vatContribution);

    const topSector = sectors[0]?.vatContribution > 0 ? sectors[0].label : null;
    const fastestGrowing = sectors
      .filter((s) => s.growthPct !== null && s.growthPct > 0)
      .sort((a, b) => (b.growthPct ?? 0) - (a.growthPct ?? 0))[0];

    return {
      sectors,
      totalVat,
      topSector,
      fastestGrowingSector: fastestGrowing?.label ?? null,
      period: 'Last 30 days',
    };
  },
  ['sector-analysis'],
  { revalidate: 300 },
);

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const data = await fetchSectorAnalysis();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  } catch (error) {
    console.error('Sector analysis API error:', error);
    return NextResponse.json({ error: 'Failed to load sector analysis' }, { status: 500 });
  }
}
