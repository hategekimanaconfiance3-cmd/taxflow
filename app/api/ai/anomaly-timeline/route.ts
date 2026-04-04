import { NextResponse } from 'next/server';
import { requireRRASession } from '@/lib/auth-guard';
import db from '@/db/drizzle';
import { transaction, auditLog } from '@/db/schema';
import { sql, gte, and } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';

export const dynamic = 'force-dynamic';

export interface AnomalyPoint {
  date: string;       // "Apr 01"
  dateSort: string;   // "2026-04-01"
  pricingAnomalies: number;
  complianceFlags: number;
  transactionGaps: number;
  totalAnomalies: number;
}

export interface AnomalyTimelineData {
  timeline: AnomalyPoint[];
  peakDate: string | null;
  peakTotal: number;
  totalAnomalies: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

const computeTimeline = unstable_cache(
  async (): Promise<AnomalyTimelineData> => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // 1. Suspicious pricing per day — price below 70% of product median (last 90 days)
    const pricingRows = await db
      .select({
        dateStr: sql<string>`TO_CHAR(${transaction.createdAt}, 'Mon DD')`.as('ds'),
        dateSort: sql<string>`DATE(${transaction.createdAt})::text`.as('dsort'),
        count: sql<number>`COUNT(*)::int`.as('cnt'),
      })
      .from(transaction)
      .where(and(
        gte(transaction.createdAt, thirtyDaysAgo),
        sql`${transaction.unitPrice} < (
          SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY t2.unit_price) * 0.7
          FROM transaction t2
          WHERE t2.product_id = ${transaction.productId}
        )`,
      ))
      .groupBy(sql`DATE(${transaction.createdAt}), TO_CHAR(${transaction.createdAt}, 'Mon DD')`)
      .orderBy(sql`DATE(${transaction.createdAt})`);

    // 2. Compliance flags per day from audit log
    const complianceRows = await db
      .select({
        dateStr: sql<string>`TO_CHAR(${auditLog.createdAt}, 'Mon DD')`.as('ds'),
        dateSort: sql<string>`DATE(${auditLog.createdAt})::text`.as('dsort'),
        count: sql<number>`COUNT(*)::int`.as('cnt'),
      })
      .from(auditLog)
      .where(and(
        gte(auditLog.createdAt, thirtyDaysAgo),
        sql`${auditLog.action} IN ('PRICE_ABOVE_CEILING', 'CLEARANCE_SUSPENDED', 'COMPLIANCE_ALERT', 'SUSPICIOUS_ACTIVITY')`,
      ))
      .groupBy(sql`DATE(${auditLog.createdAt}), TO_CHAR(${auditLog.createdAt}, 'Mon DD')`)
      .orderBy(sql`DATE(${auditLog.createdAt})`);

    // 3. Transaction volume per day (to detect gap days)
    const volumeRows = await db
      .select({
        dateSort: sql<string>`DATE(${transaction.createdAt})::text`.as('dsort'),
        count: sql<number>`COUNT(*)::int`.as('cnt'),
      })
      .from(transaction)
      .where(gte(transaction.createdAt, thirtyDaysAgo))
      .groupBy(sql`DATE(${transaction.createdAt})`)
      .orderBy(sql`DATE(${transaction.createdAt})`);

    const avgDailyVolume = volumeRows.length > 0
      ? volumeRows.reduce((s, r) => s + r.count, 0) / volumeRows.length
      : 0;

    const pricingMap = new Map(pricingRows.map(r => [r.dateSort, r.count]));
    const complianceMap = new Map(complianceRows.map(r => [r.dateSort, r.count]));
    const volumeMap = new Map(volumeRows.map(r => [r.dateSort, r.count]));

    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const timeline: AnomalyPoint[] = [];

    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateSort = d.toISOString().split('T')[0];
      const dateStr = `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`;

      const pricing = pricingMap.get(dateSort) ?? 0;
      const compliance = complianceMap.get(dateSort) ?? 0;
      const vol = volumeMap.get(dateSort) ?? 0;
      const transactionGaps = avgDailyVolume > 5 && vol < avgDailyVolume * 0.3 ? 1 : 0;

      timeline.push({
        date: dateStr,
        dateSort,
        pricingAnomalies: pricing,
        complianceFlags: compliance,
        transactionGaps,
        totalAnomalies: pricing + compliance + transactionGaps,
      });
    }

    const peakPoint = timeline.reduce(
      (best, p) => p.totalAnomalies > best.totalAnomalies ? p : best,
      timeline[0],
    );
    const totalAnomalies = timeline.reduce((s, p) => s + p.totalAnomalies, 0);

    const firstHalf = timeline.slice(0, 15).reduce((s, p) => s + p.totalAnomalies, 0);
    const secondHalf = timeline.slice(15).reduce((s, p) => s + p.totalAnomalies, 0);
    const trend: AnomalyTimelineData['trend'] =
      secondHalf > firstHalf * 1.2 ? 'increasing' :
      secondHalf < firstHalf * 0.8 ? 'decreasing' : 'stable';

    return {
      timeline,
      peakDate: (peakPoint?.totalAnomalies ?? 0) > 0 ? peakPoint.date : null,
      peakTotal: peakPoint?.totalAnomalies ?? 0,
      totalAnomalies,
      trend,
    };
  },
  ['anomaly-timeline'],
  { revalidate: 300 },
);

export async function GET(): Promise<NextResponse> {
  try {
    await requireRRASession();
    const data = await computeTimeline();
    return NextResponse.json(data);
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
}
