import { NextResponse } from 'next/server';
import { requireRRASession } from '@/lib/auth-guard';
import db from '@/db/drizzle';
import { transaction } from '@/db/schema';
import { sql, gte } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export type EbmPulsePoint = {
  minute: string; // "HH:MM"
  value: number;  // total RWF in that minute
  count: number;  // number of transactions
};

export async function GET(): Promise<NextResponse> {
  try {
    await requireRRASession();

    const sixtyMinsAgo = new Date(Date.now() - 60 * 60 * 1000);

    const rows = await db
      .select({
        bucket: sql<string>`to_char(date_trunc('minute', ${transaction.createdAt}), 'HH24:MI')`.as('bucket'),
        value: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::bigint`.as('value'),
        count: sql<number>`COUNT(*)::int`.as('count'),
      })
      .from(transaction)
      .where(gte(transaction.createdAt, sixtyMinsAgo))
      .groupBy(sql`date_trunc('minute', ${transaction.createdAt})`)
      .orderBy(sql`date_trunc('minute', ${transaction.createdAt})`);

    // Build a complete 60-point timeline (last 60 minutes, 1 per minute)
    const now = new Date();
    const dataMap = new Map(rows.map((r) => [r.bucket, r]));

    const pulse: EbmPulsePoint[] = [];
    for (let i = 59; i >= 0; i--) {
      const ts = new Date(now.getTime() - i * 60 * 1000);
      const label = ts.toTimeString().slice(0, 5); // "HH:MM"
      const row = dataMap.get(label);
      pulse.push({ minute: label, value: Number(row?.value ?? 0), count: Number(row?.count ?? 0) });
    }

    return NextResponse.json(pulse);
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
}
