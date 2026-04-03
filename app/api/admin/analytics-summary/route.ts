import { NextResponse } from 'next/server';
import { requireRRASession } from '@/lib/auth-guard';
import db from '@/db/drizzle';
import { transaction, vatRecord, taxPayment, stock, auditLog, user } from '@/db/schema';
import { sql, eq, gte, and, desc } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';

export const dynamic = 'force-dynamic';

export interface AnalyticsInsight {
  id: string;
  level: 'critical' | 'warning' | 'ok' | 'info';
  message: string;
  metric?: string;
  href?: string;
}

export interface AnalyticsSummary {
  insights: AnalyticsInsight[];
  generatedAt: string;
  period: string;
}

const computeSummary = unstable_cache(
  async (): Promise<AnalyticsSummary> => {
    const insights: AnalyticsInsight[] = [];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const prevThirtyStart = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // ── 1. VAT collection trend (this month vs last month) ──────────────
    const [vatThis] = await db
      .select({ total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as('t') })
      .from(vatRecord)
      .where(and(eq(vatRecord.vatType, 'output'), gte(vatRecord.createdAt, thirtyDaysAgo)));

    const [vatPrev] = await db
      .select({ total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as('t') })
      .from(vatRecord)
      .where(and(
        eq(vatRecord.vatType, 'output'),
        gte(vatRecord.createdAt, prevThirtyStart),
        sql`${vatRecord.createdAt} < ${thirtyDaysAgo}`,
      ));

    const vatNow = vatThis?.total ?? 0;
    const vatPrevVal = vatPrev?.total ?? 0;
    if (vatNow > 0 || vatPrevVal > 0) {
      if (vatPrevVal === 0 && vatNow > 0) {
        insights.push({ id: 'vat-new', level: 'ok', message: 'New VAT activity recorded this month — no prior comparison available', metric: 'VAT' });
      } else if (vatPrevVal > 0) {
        const pct = Math.round(((vatNow - vatPrevVal) / vatPrevVal) * 100);
        if (pct <= -15) {
          insights.push({ id: 'vat-drop', level: 'critical', message: `VAT collected dropped ${Math.abs(pct)}% vs last 30 days`, metric: `${pct}%`, href: '/admin/tax' });
        } else if (pct <= -5) {
          insights.push({ id: 'vat-decline', level: 'warning', message: `VAT collection down ${Math.abs(pct)}% vs last 30 days — monitor trend`, metric: `${pct}%`, href: '/admin/tax' });
        } else if (pct >= 10) {
          insights.push({ id: 'vat-up', level: 'ok', message: `VAT collection up ${pct}% vs last 30 days`, metric: `+${pct}%` });
        } else {
          insights.push({ id: 'vat-stable', level: 'info', message: `VAT collection stable (${pct >= 0 ? '+' : ''}${pct}% vs last 30 days)`, metric: `${pct >= 0 ? '+' : ''}${pct}%` });
        }
      }
    }

    // ── 2. Critical/high risk trader count ───────────────────────────────
    const highRiskTraders = await db
      .select({
        id: user.id,
        name: user.businessName,
        flagCount: sql<number>`COUNT(${auditLog.id})::int`.as('flag_count'),
      })
      .from(user)
      .leftJoin(auditLog, and(
        eq(auditLog.userId, user.id),
        sql`${auditLog.action} IN ('PRICE_ABOVE_CEILING', 'CLEARANCE_SUSPENDED', 'COMPLIANCE_ALERT', 'SUSPICIOUS_ACTIVITY')`,
        gte(auditLog.createdAt, sevenDaysAgo),
      ))
      .where(sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`)
      .groupBy(user.id, user.businessName)
      .having(sql`COUNT(${auditLog.id}) > 1`)
      .limit(20);

    if (highRiskTraders.length > 0) {
      insights.push({
        id: 'high-risk',
        level: 'warning',
        message: `${highRiskTraders.length} trader${highRiskTraders.length !== 1 ? 's' : ''} flagged with multiple compliance violations in the last 7 days`,
        metric: `${highRiskTraders.length} traders`,
        href: '/admin/traders',
      });
    }

    // ── 3. Negative stock (manipulation signal) ──────────────────────────
    const [negStock] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${stock.businessId})::int`.as('c') })
      .from(stock)
      .where(sql`${stock.quantity} < 0`);

    if ((negStock?.count ?? 0) > 0) {
      insights.push({
        id: 'neg-stock',
        level: 'critical',
        message: `${negStock!.count} business${negStock!.count !== 1 ? 'es' : ''} detected with negative stock — possible data manipulation`,
        metric: `${negStock!.count} flagged`,
        href: '/admin/stock',
      });
    }

    // ── 4. Suspicious pricing last 7 days ───────────────────────────────
    const suspTxns = await db
      .select({
        count: sql<number>`COUNT(*)::int`.as('c'),
      })
      .from(transaction)
      .where(
        and(
          sql`${transaction.unitPrice} < (
            SELECT PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY t2.unit_price)
            FROM transaction t2
            WHERE t2.product_id = ${transaction.productId}
          ) * 0.5`,
          gte(transaction.createdAt, sevenDaysAgo),
        ),
      );

    const suspCount = suspTxns[0]?.count ?? 0;
    if (suspCount > 0) {
      insights.push({
        id: 'suspicious-pricing',
        level: 'warning',
        message: `${suspCount} transaction${suspCount !== 1 ? 's' : ''} with pricing significantly below market median detected`,
        metric: `${suspCount} flagged`,
        href: '/admin/transactions',
      });
    }

    // ── 5. Pending transactions > 48h (stuck chain) ─────────────────────
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const [stalePending] = await db
      .select({ count: sql<number>`COUNT(*)::int`.as('c') })
      .from(transaction)
      .where(and(
        eq(transaction.status, 'pending'),
        sql`${transaction.createdAt} < ${fortyEightHoursAgo}`,
      ));

    if ((stalePending?.count ?? 0) > 0) {
      insights.push({
        id: 'stale-pending',
        level: 'warning',
        message: `${stalePending!.count} pending transaction${stalePending!.count !== 1 ? 's' : ''} unconfirmed for over 48 hours`,
        metric: `${stalePending!.count} stalled`,
        href: '/admin/transactions',
      });
    }

    // ── 6. Tax gap severity ───────────────────────────────────────────────
    const [totalVatOwed] = await db
      .select({ total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as('t') })
      .from(vatRecord)
      .where(eq(vatRecord.vatType, 'output'));

    const [totalPaid] = await db
      .select({ total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as('t') })
      .from(taxPayment)
      .where(eq(taxPayment.status, 'confirmed'));

    const owed = totalVatOwed?.total ?? 0;
    const paid = totalPaid?.total ?? 0;
    if (owed > 0) {
      // Clamp to 0-100: if paid >= owed the gap is 0 (fully covered / overpaid)
      const rawGap = ((owed - paid) / owed) * 100;
      const gapPct = Math.round(Math.max(0, Math.min(100, rawGap)));
      if (gapPct >= 30) {
        insights.push({ id: 'tax-gap', level: 'critical', message: `National tax gap is ${gapPct}% — high outstanding VAT obligations`, metric: `${gapPct}% gap`, href: '/admin/tax' });
      } else if (gapPct >= 15) {
        insights.push({ id: 'tax-gap', level: 'warning', message: `National tax gap at ${gapPct}% — collection below target`, metric: `${gapPct}% gap`, href: '/admin/tax' });
      } else {
        insights.push({ id: 'tax-gap', level: 'ok', message: `Tax collection strong — only ${gapPct}% gap nationally`, metric: `${gapPct}% gap` });
      }
    }

    // ── 7. Transaction volume trend (today vs daily avg) ─────────────────
    const [todayTxns] = await db
      .select({ count: sql<number>`COUNT(*)::int`.as('c') })
      .from(transaction)
      .where(sql`${transaction.createdAt} >= CURRENT_DATE`);

    const [weekTxns] = await db
      .select({ count: sql<number>`COUNT(*)::int`.as('c') })
      .from(transaction)
      .where(gte(transaction.createdAt, sevenDaysAgo));

    const todayCount = todayTxns?.count ?? 0;
    const weeklyAvg = Math.round((weekTxns?.count ?? 0) / 7);
    if (weeklyAvg > 5 && todayCount < weeklyAvg * 0.3) {
      insights.push({
        id: 'low-txn',
        level: 'warning',
        message: `Transaction volume today (${todayCount}) is ${Math.round((todayCount / weeklyAvg) * 100)}% of daily average — unusually low`,
        metric: `${todayCount} vs avg ${weeklyAvg}`,
        href: '/admin/transactions',
      });
    } else if (todayCount === 0 && weeklyAvg > 0) {
      insights.push({ id: 'no-txn', level: 'critical', message: 'No transactions recorded today — system may be experiencing issues', metric: '0 today', href: '/admin/transactions' });
    }

    // Ensure at least one "all clear" if no issues
    if (insights.filter((i) => i.level !== 'info').length === 0 && insights.length === 0) {
      insights.push({ id: 'all-clear', level: 'ok', message: 'No critical issues detected — system operating normally' });
    }

    // Sort: critical first, then warning, then ok, then info
    const order = { critical: 0, warning: 1, ok: 2, info: 3 };
    insights.sort((a, b) => order[a.level] - order[b.level]);

    return {
      insights: insights.slice(0, 6),
      generatedAt: new Date().toISOString(),
      period: 'Last 30 days',
    };
  },
  ['analytics-summary'],
  { revalidate: 120 },
);

export async function GET(): Promise<NextResponse> {
  try {
    await requireRRASession();
    const summary = await computeSummary();
    return NextResponse.json(summary);
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
}
