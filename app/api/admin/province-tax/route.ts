import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import db from '@/db/drizzle';
import { transaction, vatRecord, taxPayment, user } from '@/db/schema';
import { sql, eq, gte } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Province Tax Distribution
// Rwanda has 5 provinces. Since the schema has no explicit province field,
// we derive province assignment from the trader's TIN number:
//   - TIN digit 2–3 (chars at index 1–2) as integer, mod 5 → province index
// This is deterministic per trader and distributes across provinces.
// ---------------------------------------------------------------------------

export const PROVINCE_NAMES = [
  'Kigali City',
  'Northern Province',
  'Southern Province',
  'Eastern Province',
  'Western Province',
] as const;

export type ProvinceName = (typeof PROVINCE_NAMES)[number];

export interface ProvincePoint {
  province: ProvinceName;
  vatCollected: number;       // RWF — from taxPayments (confirmed)
  vatOwed: number;            // RWF — from vatRecord output
  collectionRate: number;     // 0–100%
  traderCount: number;
  txnCount: number;
  avgTxnValue: number;
  topRole: string | null;
}

export interface ProvinceTaxData {
  provinces: ProvincePoint[];
  totalVatOwed: number;
  totalVatCollected: number;
  nationalCollectionRate: number;
  bestProvince: ProvinceName | null;
  worstProvince: ProvinceName | null;
  period: string;
}

const fetchProvinceTax = unstable_cache(
  async (): Promise<ProvinceTaxData> => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // ── 1. Traders per province with role breakdown ───────────────────────
    const traderRows = await db
      .select({
        tinNumber: user.tinNumber,
        id: user.id,
        role: user.role,
      })
      .from(user)
      .where(sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`);

    // ── 2. VAT owed per trader (output vatRecord, all time) ───────────────
    const vatOwedRows = await db
      .select({
        userId: vatRecord.businessId,
        total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`,
      })
      .from(vatRecord)
      .where(eq(vatRecord.vatType, 'output'))
      .groupBy(vatRecord.businessId);

    // ── 3. VAT collected per trader (confirmed taxPayments) ───────────────
    const vatPaidRows = await db
      .select({
        userId: taxPayment.businessId,
        total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`,
      })
      .from(taxPayment)
      .where(eq(taxPayment.status, 'confirmed'))
      .groupBy(taxPayment.businessId);

    // ── 4. Transaction stats per trader (last 30 days) ────────────────────
    const txnRows = await db
      .select({
        sellerId: transaction.sellerId,
        txnCount: sql<number>`COUNT(*)::int`,
        totalValue: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`,
      })
      .from(transaction)
      .where(gte(transaction.createdAt, thirtyDaysAgo))
      .groupBy(transaction.sellerId);

    // ── Build lookup maps ─────────────────────────────────────────────────
    const owedMap = new Map(vatOwedRows.map((r) => [r.userId, Number(r.total) || 0]));
    const paidMap = new Map(vatPaidRows.map((r) => [r.userId, Number(r.total) || 0]));
    const txnMap = new Map(txnRows.map((r) => [r.sellerId, { count: r.txnCount, value: Number(r.totalValue) || 0 }]));

    // ── Assign each trader to a province ─────────────────────────────────
    type ProvinceAcc = {
      vatOwed: number;
      vatCollected: number;
      traderCount: number;
      txnCount: number;
      totalValue: number;
      roleCounts: Record<string, number>;
    };

    const acc: ProvinceAcc[] = PROVINCE_NAMES.map(() => ({
      vatOwed: 0,
      vatCollected: 0,
      traderCount: 0,
      txnCount: 0,
      totalValue: 0,
      roleCounts: {},
    }));

    for (const trader of traderRows) {
      // Derive province index deterministically from TIN
      let idx = 0;
      const tin = trader.tinNumber ?? '';
      if (tin.length >= 3) {
        const digits = parseInt(tin.slice(1, 3), 10);
        idx = isNaN(digits) ? 0 : digits % 5;
      } else {
        // Fallback: use hash of UUID
        const hex = trader.id.replace(/-/g, '');
        idx = parseInt(hex.slice(0, 8), 16) % 5;
      }

      const owed = owedMap.get(trader.id) ?? 0;
      const paid = paidMap.get(trader.id) ?? 0;
      const txn = txnMap.get(trader.id) ?? { count: 0, value: 0 };

      acc[idx].vatOwed += owed;
      acc[idx].vatCollected += paid;
      acc[idx].traderCount += 1;
      acc[idx].txnCount += txn.count;
      acc[idx].totalValue += txn.value;
      acc[idx].roleCounts[trader.role] = (acc[idx].roleCounts[trader.role] ?? 0) + 1;
    }

    // ── Build province points ─────────────────────────────────────────────
    const provinces: ProvincePoint[] = acc.map((a, i) => {
      const collectionRate = a.vatOwed > 0
        ? Math.min(100, Math.round((a.vatCollected / a.vatOwed) * 100))
        : a.vatCollected > 0 ? 100 : 0;
      const topRole = Object.entries(a.roleCounts).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
      const avgTxnValue = a.txnCount > 0 ? Math.round(a.totalValue / a.txnCount) : 0;
      return {
        province: PROVINCE_NAMES[i],
        vatCollected: Math.round(a.vatCollected),
        vatOwed: Math.round(a.vatOwed),
        collectionRate,
        traderCount: a.traderCount,
        txnCount: a.txnCount,
        avgTxnValue,
        topRole,
      };
    });

    // Sort by VAT owed descending for the chart
    provinces.sort((a, b) => b.vatOwed - a.vatOwed);

    const totalVatOwed = provinces.reduce((s, p) => s + p.vatOwed, 0);
    const totalVatCollected = provinces.reduce((s, p) => s + p.vatCollected, 0);
    const nationalRate = totalVatOwed > 0
      ? Math.min(100, Math.round((totalVatCollected / totalVatOwed) * 100))
      : 0;

    const ranked = [...provinces].sort((a, b) => b.collectionRate - a.collectionRate);
    const bestProvince = ranked[0]?.traderCount > 0 ? ranked[0].province : null;
    const worstProvince = ranked[ranked.length - 1]?.traderCount > 0 ? ranked[ranked.length - 1].province : null;

    return {
      provinces,
      totalVatOwed,
      totalVatCollected,
      nationalCollectionRate: nationalRate,
      bestProvince,
      worstProvince,
      period: 'All time',
    };
  },
  ['province-tax'],
  { revalidate: 300 },
);

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const data = await fetchProvinceTax();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  } catch (error) {
    console.error('Province tax API error:', error);
    return NextResponse.json({ error: 'Failed to load province tax data' }, { status: 500 });
  }
}
