import { NextResponse } from 'next/server';
import { requireRRASession } from '@/lib/auth-guard';
import db from '@/db/drizzle';
import { transaction, vatRecord, taxPayment, auditLog, user, stock } from '@/db/schema';
import { sql, gte, eq, and, desc } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';

export const dynamic = 'force-dynamic';

export interface InsightItem {
  id: string;
  level: 'critical' | 'warning' | 'positive' | 'info';
  category: 'vat' | 'compliance' | 'pricing' | 'trader' | 'transaction' | 'sector';
  message: string;
  detail?: string;
  metric?: string;
  href?: string;
  timestamp: string;
}

export interface InsightsFeedData {
  items: InsightItem[];
  generatedAt: string;
  criticalCount: number;
  warningCount: number;
}

const computeFeed = unstable_cache(
  async (): Promise<InsightsFeedData> => {
    const items: InsightItem[] = [];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const prevThirtyStart = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const now = new Date().toISOString();

    // 1. Traders who stopped reporting
    const recentlyActive = await db
      .select({ sellerId: transaction.sellerId })
      .from(transaction)
      .where(and(
        gte(transaction.createdAt, prevThirtyStart),
        sql`${transaction.createdAt} < ${sevenDaysAgo}`,
      ))
      .groupBy(transaction.sellerId);

    const stillActive = await db
      .select({ sellerId: transaction.sellerId })
      .from(transaction)
      .where(gte(transaction.createdAt, sevenDaysAgo))
      .groupBy(transaction.sellerId);

    const recentSet = new Set(recentlyActive.map(t => t.sellerId));
    const stillSet = new Set(stillActive.map(t => t.sellerId));
    const stoppedCount = [...recentSet].filter(id => !stillSet.has(id)).length;

    if (stoppedCount > 0) {
      items.push({
        id: 'stopped-reporting',
        level: 'warning',
        category: 'trader',
        message: `${stoppedCount} trader${stoppedCount !== 1 ? 's' : ''} stopped reporting in the last 7 days`,
        detail: 'These traders had activity in the prior period but show no transactions this week — possible evasion signal',
        metric: `${stoppedCount} inactive`,
        href: '/admin/traders',
        timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      });
    }

    // 2. Wholesale VAT trend
    const [wVatNowRow] = await db
      .select({ total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8` })
      .from(vatRecord)
      .innerJoin(user, eq(vatRecord.businessId, user.id))
      .where(and(eq(vatRecord.vatType, 'output'), eq(user.role, 'wholesaler'), gte(vatRecord.createdAt, sevenDaysAgo)));

    const [wVatPrevRow] = await db
      .select({ total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8` })
      .from(vatRecord)
      .innerJoin(user, eq(vatRecord.businessId, user.id))
      .where(and(
        eq(vatRecord.vatType, 'output'), eq(user.role, 'wholesaler'),
        gte(vatRecord.createdAt, prevThirtyStart),
        sql`${vatRecord.createdAt} < ${sevenDaysAgo}`,
      ));

    const wNow = wVatNowRow?.total ?? 0;
    const wPrev = wVatPrevRow?.total ?? 0;
    if (wPrev > 0) {
      const wPct = Math.round(((wNow - wPrev) / wPrev) * 100);
      if (wPct <= -15) {
        items.push({
          id: 'wholesale-vat-drop',
          level: 'warning',
          category: 'vat',
          message: `Wholesale VAT dropped ${Math.abs(wPct)}% in the last 7 days`,
          detail: 'Compared to prior period — may indicate underreporting or reduced wholesale activity',
          metric: `${wPct}%`,
          href: '/admin/tax',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        });
      } else if (wPct >= 15) {
        items.push({
          id: 'wholesale-vat-up',
          level: 'positive',
          category: 'vat',
          message: `Wholesale VAT increased ${wPct}% vs prior 7 days`,
          detail: 'Positive compliance signal in the wholesale sector',
          metric: `+${wPct}%`,
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        });
      }
    }

    // 3. Retail compliance trend
    const [rVatNowRow] = await db
      .select({ total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8` })
      .from(vatRecord)
      .innerJoin(user, eq(vatRecord.businessId, user.id))
      .where(and(eq(vatRecord.vatType, 'output'), eq(user.role, 'retailer'), gte(vatRecord.createdAt, sevenDaysAgo)));

    const [rVatPrevRow] = await db
      .select({ total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8` })
      .from(vatRecord)
      .innerJoin(user, eq(vatRecord.businessId, user.id))
      .where(and(
        eq(vatRecord.vatType, 'output'), eq(user.role, 'retailer'),
        gte(vatRecord.createdAt, prevThirtyStart),
        sql`${vatRecord.createdAt} < ${sevenDaysAgo}`,
      ));

    const rNow = rVatNowRow?.total ?? 0;
    const rPrev = rVatPrevRow?.total ?? 0;
    if (rPrev > 0) {
      const rPct = Math.round(((rNow - rPrev) / rPrev) * 100);
      if (rPct >= 10) {
        items.push({
          id: 'retail-compliance-up',
          level: 'positive',
          category: 'sector',
          message: `Retail compliance improved — VAT up ${rPct}% vs prior period`,
          detail: 'Retail sector showing stronger collection performance this week',
          metric: `+${rPct}%`,
          timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        });
      } else if (rPct <= -15) {
        items.push({
          id: 'retail-compliance-drop',
          level: 'warning',
          category: 'sector',
          message: `Retail VAT collection down ${Math.abs(rPct)}% vs prior period`,
          detail: 'Retail traders may be underreporting sales activity',
          metric: `${rPct}%`,
          href: '/admin/traders',
          timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        });
      }
    }

    // 4. Negative stock
    const [negStock] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${stock.businessId})::int` })
      .from(stock)
      .where(sql`${stock.quantity} < 0`);

    if ((negStock?.count ?? 0) > 0) {
      items.push({
        id: 'neg-stock',
        level: 'critical',
        category: 'trader',
        message: `${negStock!.count} business${negStock!.count !== 1 ? 'es' : ''} detected with negative stock`,
        detail: 'Negative inventory is a strong indicator of ghost transactions or data manipulation',
        metric: `${negStock!.count} flagged`,
        href: '/admin/traders',
        timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      });
    }

    // 5. Compliance flags from audit log
    const [auditFlags] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(auditLog)
      .where(and(
        sql`${auditLog.action} IN ('PRICE_ABOVE_CEILING', 'CLEARANCE_SUSPENDED', 'COMPLIANCE_ALERT', 'SUSPICIOUS_ACTIVITY')`,
        gte(auditLog.createdAt, sevenDaysAgo),
      ));

    if ((auditFlags?.count ?? 0) > 0) {
      items.push({
        id: 'audit-flags',
        level: 'warning',
        category: 'compliance',
        message: `${auditFlags!.count} compliance violation${auditFlags!.count !== 1 ? 's' : ''} flagged in the last 7 days`,
        detail: 'Includes price ceiling violations, suspended clearances, and suspicious activity markers',
        metric: `${auditFlags!.count} violations`,
        href: '/admin/traders',
        timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      });
    }

    // 6. Transaction volume today
    const [todayTxns] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(transaction)
      .where(sql`${transaction.createdAt} >= CURRENT_DATE`);

    const [weekTxns] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(transaction)
      .where(gte(transaction.createdAt, sevenDaysAgo));

    const todayCount = todayTxns?.count ?? 0;
    const weeklyAvg = Math.round((weekTxns?.count ?? 0) / 7);

    if (weeklyAvg > 5) {
      if (todayCount < weeklyAvg * 0.3) {
        items.push({
          id: 'low-txn-today',
          level: 'warning',
          category: 'transaction',
          message: `Only ${todayCount} transactions so far today — well below daily average of ${weeklyAvg}`,
          detail: 'Could indicate system issues or widespread trader inactivity',
          metric: `${todayCount} vs avg ${weeklyAvg}`,
          href: '/admin/transactions',
          timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        });
      } else if (todayCount > weeklyAvg * 2) {
        items.push({
          id: 'high-txn-today',
          level: 'info',
          category: 'transaction',
          message: `High transaction volume today — ${todayCount} vs daily average of ${weeklyAvg}`,
          detail: 'Unusual spike — may warrant spot-checks for anomalies',
          metric: `${todayCount} today`,
          href: '/admin/transactions',
          timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        });
      }
    }

    // Sort by severity
    const levelOrder: Record<string, number> = { critical: 0, warning: 1, positive: 2, info: 3 };
    items.sort((a, b) => (levelOrder[a.level] ?? 3) - (levelOrder[b.level] ?? 3));

    if (items.length === 0) {
      items.push({
        id: 'all-clear',
        level: 'positive',
        category: 'compliance',
        message: 'No critical signals detected — all systems operating normally',
        detail: 'Scanned VAT records, transaction volume, stock levels, and compliance flags',
        timestamp: now,
      });
    }

    return {
      items: items.slice(0, 10),
      generatedAt: now,
      criticalCount: items.filter(i => i.level === 'critical').length,
      warningCount: items.filter(i => i.level === 'warning').length,
    };
  },
  ['ai-insights-feed'],
  { revalidate: 180 },
);

export async function GET(): Promise<NextResponse> {
  try {
    await requireRRASession();
    const data = await computeFeed();
    return NextResponse.json(data);
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
}
