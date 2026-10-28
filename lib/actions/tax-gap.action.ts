'use server';

import { sql, eq } from 'drizzle-orm';
import db from '@/db/drizzle';
import { vatRecord, taxPayment, user } from '@/db/schema';
import { requireRRASession } from '@/lib/auth-guard';

// ---------------------------------------------------------------------------
// Tax Gap Dashboard — breakdown by sector and trader
// ---------------------------------------------------------------------------

export interface TaxGapData {
  totalExpected: number;
  totalCollected: number;
  totalGap: number;
  gapPercentage: number;
  bySector: SectorGap[];
  topTraderGaps: TraderGap[];
}

export interface SectorGap {
  sector: string;
  expected: number;
  collected: number;
  gap: number;
  gapPercentage: number;
  traderCount: number;
}

export interface TraderGap {
  id: string;
  name: string;
  role: string;
  expected: number;
  collected: number;
  gap: number;
  gapPercentage: number;
}

/**
 * Compute national tax gap broken down by sector (role) and per-trader.
 */
export async function getTaxGapData(): Promise<TaxGapData> {
  await requireRRASession("super_admin", "compliance_officer", "reporting_officer", "tax_compliance_officer", "payments_reconciliation_officer", "data_ai_analyst");

  try {
    // VAT output per trader (what they owe)
    // Cast to float8 so pg driver returns a JS number, not a bigint string
    const vatByTrader = await db
      .select({
        businessId: vatRecord.businessId,
        total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as('total'),
      })
      .from(vatRecord)
      .where(eq(vatRecord.vatType, 'output'))
      .groupBy(vatRecord.businessId);

    // Tax payments per trader (what they paid)
    const payByTrader = await db
      .select({
        businessId: taxPayment.businessId,
        total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as('total'),
      })
      .from(taxPayment)
      .where(eq(taxPayment.status, 'confirmed'))
      .groupBy(taxPayment.businessId);

    // Trader info
    const traders = await db
      .select({
        id: user.id,
        name: user.businessName,
        role: user.role,
      })
      .from(user)
      .where(sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`);

    const owedMap = new Map(vatByTrader.map((v) => [v.businessId, v.total]));
    const paidMap = new Map(payByTrader.map((p) => [p.businessId, p.total]));
    const traderMap = new Map(traders.map((t) => [t.id, t]));

    // Build per-trader gaps
    const traderGaps: TraderGap[] = [];
    const sectorAcc: Record<string, { expected: number; collected: number; count: number }> = {};

    // Process all traders with VAT obligations
    for (const vat of vatByTrader) {
      const expected = Number(vat.total) || 0;
      const collected = Number(paidMap.get(vat.businessId) ?? 0) || 0;
      const gap = expected - collected;
      const trader = traderMap.get(vat.businessId);
      const role = trader?.role ?? 'unknown';

      // Sector accumulation
      if (!sectorAcc[role]) {
        sectorAcc[role] = { expected: 0, collected: 0, count: 0 };
      }
      sectorAcc[role].expected += expected;
      sectorAcc[role].collected += collected;
      sectorAcc[role].count++;

      if (gap > 0) {
        traderGaps.push({
          id: vat.businessId,
          name: trader?.name ?? 'Unknown',
          role,
          expected,
          collected,
          gap,
          gapPercentage: expected > 0 ? Math.round((gap / expected) * 100) : 0,
        });
      }
    }

    const totalExpected = Object.values(sectorAcc).reduce((s, v) => s + v.expected, 0);
    const totalCollected = Object.values(sectorAcc).reduce((s, v) => s + v.collected, 0);
    const totalGap = totalExpected - totalCollected;

    const SECTOR_LABELS: Record<string, string> = {
      manufacturer: 'Manufacturing',
      wholesaler: 'Wholesale',
      retailer: 'Retail',
    };

    const bySector: SectorGap[] = Object.entries(sectorAcc)
      .map(([sector, data]) => ({
        sector: SECTOR_LABELS[sector] ?? sector,
        expected: data.expected,
        collected: data.collected,
        gap: data.expected - data.collected,
        gapPercentage: data.expected > 0 ? Math.round(((data.expected - data.collected) / data.expected) * 100) : 0,
        traderCount: data.count,
      }))
      .sort((a, b) => b.gap - a.gap);

    const topTraderGaps = traderGaps.sort((a, b) => b.gap - a.gap).slice(0, 10);

    return {
      totalExpected,
      totalCollected,
      totalGap: Math.max(0, totalGap),
      gapPercentage: totalExpected > 0 ? Math.round((Math.max(0, totalGap) / totalExpected) * 100) : 0,
      bySector,
      topTraderGaps,
    };
  } catch (error) {
    console.error('Tax gap error:', error);
    return {
      totalExpected: 0,
      totalCollected: 0,
      totalGap: 0,
      gapPercentage: 0,
      bySector: [],
      topTraderGaps: [],
    };
  }
}
