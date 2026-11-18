import { NextResponse } from 'next/server';
import { requireRRAPermission } from '@/lib/auth-guard';
import { listPriceAlerts } from '@/lib/price-monitoring-service';
import { priceAlertQuerySchema } from '@/lib/validation/price-monitoring.schema';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { staff } = await requireRRAPermission('price.alert.read');
    const url = new URL(request.url);
    const parsed = priceAlertQuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid alert filters.' }, { status: 400 });
    return NextResponse.json({ alerts: await listPriceAlerts(staff, parsed.data) });
  } catch (error) {
    console.error('[price-alerts:list]', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ error: 'Price alerts could not be loaded.' }, { status: 500 });
  }
}

