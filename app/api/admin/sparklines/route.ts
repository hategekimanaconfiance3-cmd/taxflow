import { NextResponse } from 'next/server';
import { requireRRASession } from '@/lib/auth-guard';
import db from '@/db/drizzle';
import { transaction, taxPayment } from '@/db/schema';
import { sql, gte } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';

const fetchSparklines = unstable_cache(
  async () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [txnByDay, paymentsByDay] = await Promise.all([
      db
        .select({
          day: sql<string>`DATE(${transaction.createdAt})`.as('day'),
          count: sql<number>`COUNT(*)::int`.as('count'),
          vat: sql<number>`COALESCE(SUM(${transaction.vatAmount}), 0)::bigint`.as('vat'),
        })
        .from(transaction)
        .where(gte(transaction.createdAt, sevenDaysAgo))
        .groupBy(sql`DATE(${transaction.createdAt})`)
        .orderBy(sql`DATE(${transaction.createdAt})`),

      db
        .select({
          day: sql<string>`DATE(${taxPayment.createdAt})`.as('day'),
          value: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::bigint`.as('value'),
        })
        .from(taxPayment)
        .where(gte(taxPayment.createdAt, sevenDaysAgo))
        .groupBy(sql`DATE(${taxPayment.createdAt})`)
        .orderBy(sql`DATE(${taxPayment.createdAt})`),
    ]);

    // Build 7-day date array (YYYY-MM-DD, UTC)
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }

    const txnMap = new Map(txnByDay.map((r) => [r.day, r]));
    const payMap = new Map(paymentsByDay.map((r) => [r.day, r]));

    return {
      transactions: days.map((d) => ({ d, v: Number(txnMap.get(d)?.count ?? 0) })),
      vatGenerated: days.map((d) => ({ d, v: Number(txnMap.get(d)?.vat ?? 0) })),
      vatCollected: days.map((d) => ({ d, v: Number(payMap.get(d)?.value ?? 0) })),
    };
  },
  ['admin-sparklines'],
  { revalidate: 300 },
);

export async function GET(): Promise<NextResponse> {
  try {
    await requireRRASession();
    const data = await fetchSparklines();
    return NextResponse.json(data);
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
}
