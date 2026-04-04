import { NextResponse } from 'next/server';
import { requireRRASession } from '@/lib/auth-guard';
import db from '@/db/drizzle';
import { transaction, vatRecord, taxPayment, auditLog, user, stock } from '@/db/schema';
import { sql, gte, eq, and, desc } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';

export const dynamic = 'force-dynamic';

export interface DecisionAction {
  id: string;
  title: string;
  reason: string;
  impact: 'critical' | 'high' | 'medium' | 'low';
  impactLabel: string;
  category: 'audit' | 'sector' | 'transaction' | 'compliance' | 'pricing';
  href?: string;
}

export interface DecisionPanelData {
  actions: DecisionAction[];
  generatedAt: string;
}

function fmtAmt(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return Math.round(n).toString();
}

const computeDecisions = unstable_cache(
  async (): Promise<DecisionPanelData> => {
    const actions: DecisionAction[] = [];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // 1. Traders with multiple compliance violations
    const criticalTraders = await db
      .select({
        userId: user.id,
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
      .having(sql`COUNT(${auditLog.id}) >= 2`)
      .orderBy(desc(sql`COUNT(${auditLog.id})`))
      .limit(10);

    if (criticalTraders.length > 0) {
      const topNames = criticalTraders.slice(0, 3).map(t => t.name ?? 'Unknown').join(', ');
      actions.push({
        id: 'audit-critical',
        title: `Audit ${criticalTraders.length} high-priority trader${criticalTraders.length !== 1 ? 's' : ''} immediately`,
        reason: `${criticalTraders.length} trader${criticalTraders.length !== 1 ? 's' : ''} flagged with multiple compliance violations in the past 7 days. Top offenders: ${topNames}`,
        impact: 'critical',
        impactLabel: 'Multiple active compliance flags — immediate action required',
        category: 'audit',
        href: '/admin/traders',
      });
    }

    // 2. Sector with highest VAT gap
    const sectorOwed = await db
      .select({
        role: user.role,
        vatOwed: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as('vat_owed'),
      })
      .from(user)
      .leftJoin(vatRecord, and(eq(vatRecord.businessId, user.id), eq(vatRecord.vatType, 'output')))
      .where(sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`)
      .groupBy(user.role)
      .orderBy(desc(sql`vat_owed`));

    const sectorPaid = await db
      .select({
        role: user.role,
        vatPaid: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as('vat_paid'),
      })
      .from(user)
      .leftJoin(taxPayment, and(eq(taxPayment.businessId, user.id), eq(taxPayment.status, 'confirmed')))
      .where(sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`)
      .groupBy(user.role);

    const paidMap = new Map(sectorPaid.map(r => [r.role, r.vatPaid]));
    const ROLE_LABELS: Record<string, string> = { manufacturer: 'Manufacturing', wholesaler: 'Wholesale', retailer: 'Retail' };

    // Find sector with highest absolute gap
    let worstSector: { role: string; gap: number; gapPct: number } | null = null;
    for (const sg of sectorOwed) {
      const paid = paidMap.get(sg.role) ?? 0;
      const gap = Math.max(0, sg.vatOwed - paid);
      const gapPct = sg.vatOwed > 0 ? Math.round((gap / sg.vatOwed) * 100) : 0;
      if (gapPct >= 20 && (!worstSector || gap > worstSector.gap)) {
        worstSector = { role: sg.role, gap, gapPct };
      }
    }

    if (worstSector) {
      const label = ROLE_LABELS[worstSector.role] ?? worstSector.role;
      actions.push({
        id: 'sector-gap',
        title: `Investigate ${label} sector tax gap`,
        reason: `${label} sector has a ${worstSector.gapPct}% VAT collection gap (${fmtAmt(worstSector.gap)} RWF outstanding). Underreporting or non-payment may be widespread in this sector.`,
        impact: worstSector.gapPct >= 40 ? 'critical' : 'high',
        impactLabel: `Potential recovery: ${fmtAmt(worstSector.gap)} RWF`,
        category: 'sector',
        href: '/admin/traders',
      });
    }

    // 3. Stale pending transactions
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const [stalePending] = await db
      .select({
        count: sql<number>`COUNT(*)::int`.as('c'),
        totalValue: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`.as('v'),
      })
      .from(transaction)
      .where(and(
        eq(transaction.status, 'pending'),
        sql`${transaction.createdAt} < ${fortyEightHoursAgo}`,
      ));

    if ((stalePending?.count ?? 0) > 0) {
      const cnt = stalePending!.count;
      const val = stalePending!.totalValue;
      actions.push({
        id: 'stale-pending',
        title: `Follow up on ${cnt} stalled transaction${cnt !== 1 ? 's' : ''}`,
        reason: `${cnt} pending transaction${cnt !== 1 ? 's' : ''} unconfirmed for over 48 hours, representing ${fmtAmt(val)} RWF in potential VAT. These may be abandoned or fraudulent entries.`,
        impact: cnt > 20 ? 'high' : 'medium',
        impactLabel: `${fmtAmt(val)} RWF at risk`,
        category: 'transaction',
        href: '/admin/transactions',
      });
    }

    // 4. Suspicious pricing
    const [suspPricing] = await db
      .select({ count: sql<number>`COUNT(*)::int`.as('c') })
      .from(transaction)
      .where(and(
        gte(transaction.createdAt, sevenDaysAgo),
        sql`${transaction.unitPrice} < (
          SELECT PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY t2.unit_price) * 0.5
          FROM transaction t2
          WHERE t2.product_id = ${transaction.productId}
        )`,
      ));

    if ((suspPricing?.count ?? 0) > 0) {
      actions.push({
        id: 'suspicious-pricing',
        title: 'Review suspicious pricing anomalies',
        reason: `${suspPricing!.count} transaction${suspPricing!.count !== 1 ? 's' : ''} detected with prices significantly below market median in the last 7 days. Undervalued transactions directly reduce VAT base.`,
        impact: 'high',
        impactLabel: `${suspPricing!.count} pricing flags to review`,
        category: 'pricing',
        href: '/admin/transactions',
      });
    }

    // 5. Negative stock
    const [negStock] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${stock.businessId})::int`.as('c') })
      .from(stock)
      .where(sql`${stock.quantity} < 0`);

    if ((negStock?.count ?? 0) > 0) {
      actions.push({
        id: 'neg-stock-action',
        title: `Investigate ${negStock!.count} business${negStock!.count !== 1 ? 'es' : ''} with negative stock`,
        reason: 'Negative inventory is a strong signal of ghost transactions or manipulation to reduce VAT liability. These businesses require immediate field verification.',
        impact: 'critical',
        impactLabel: `${negStock!.count} flagged — possible fraud`,
        category: 'compliance',
        href: '/admin/traders',
      });
    }

    const impactOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    actions.sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact]);

    return {
      actions: actions.slice(0, 7),
      generatedAt: new Date().toISOString(),
    };
  },
  ['ai-decision-panel'],
  { revalidate: 180 },
);

export async function GET(): Promise<NextResponse> {
  try {
    await requireRRASession();
    const data = await computeDecisions();
    return NextResponse.json(data);
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
}
