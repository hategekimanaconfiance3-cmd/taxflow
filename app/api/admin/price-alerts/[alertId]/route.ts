import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireRRAPermission } from '@/lib/auth-guard';
import { getPriceAlertDetail, reviewPriceAlert } from '@/lib/price-monitoring-service';
import { priceAlertActionSchema } from '@/lib/validation/price-monitoring.schema';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ alertId: string }> }) {
  try {
    const { staff } = await requireRRAPermission('price.alert.read');
    const { alertId } = await context.params;
    const alert = await getPriceAlertDetail(staff, alertId);
    if (!alert) return NextResponse.json({ error: 'Price alert not found.' }, { status: 404 });
    return NextResponse.json({ alert });
  } catch (error) {
    console.error('[price-alerts:detail]', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ error: 'Price alert could not be loaded.' }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ alertId: string }> }) {
  const requestId = randomUUID();
  try {
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Enter a valid review action.', requestId }, { status: 400 }); }
    const parsed = priceAlertActionSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Enter a valid review action.', requestId }, { status: 400 });
    const permission = parsed.data.action === 'review' ? 'price.alert.review' : 'price.alert.escalate';
    const { user: actor, staff } = await requireRRAPermission(permission);
    const { alertId } = await context.params;
    await reviewPriceAlert(staff, alertId, parsed.data.action, parsed.data.reason, actor.id);
    return NextResponse.json({ success: true, requestId });
  } catch (error) {
    console.error('[price-alerts:action]', { requestId, errorName: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Price alert action failed.', requestId }, { status: 400 });
  }
}

