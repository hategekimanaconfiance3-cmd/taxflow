import { NextResponse } from 'next/server';
import { requireAnyRRAPermission } from '@/lib/auth-guard';
import db from '@/db/drizzle';
import { transaction } from '@/db/schema';
import { sql, gte, and } from 'drizzle-orm';

export async function GET() {
  try {
    await requireAnyRRAPermission('transaction.read', 'analytics.read', 'reports.aggregate.read');

    const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000);

    const rows = await db
      .select({
        minute: sql<string>`to_char(date_trunc('minute', ${transaction.createdAt}), 'HH24:MI')`.as('minute'),
        value: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`.as('value'),
        count: sql<number>`COUNT(*)::int`.as('count'),
      })
      .from(transaction)
      .where(
        and(
          gte(transaction.createdAt, sixtyMinutesAgo),
          sql`${transaction.status} IN ('confirmed', 'completed')`
        )
      )
      .groupBy(sql`date_trunc('minute', ${transaction.createdAt})`)
      .orderBy(sql`date_trunc('minute', ${transaction.createdAt})`);

    // Build complete 60-point array
    const now = new Date();
    const map = new Map(rows.map((r) => [r.minute, r]));
    const pulse = Array.from({ length: 60 }, (_, i) => {
      const ts = new Date(now.getTime() - (59 - i) * 60 * 1000);
      const label = ts.toTimeString().slice(0, 5);
      return map.get(label) ?? { minute: label, value: 0, count: 0 };
    });

    return NextResponse.json(pulse);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
