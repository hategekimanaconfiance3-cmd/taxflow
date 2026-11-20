import { NextResponse } from 'next/server';
import { requireTraderSession } from '@/lib/auth-guard';
import { submitPriceAlertExplanation } from '@/lib/price-monitoring-service';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ alertId: string }> }) {
  try {
    const session = await requireTraderSession(['manufacturer', 'wholesaler', 'retailer']);
    const { alertId } = await context.params;
    return NextResponse.json({ explanation: await submitPriceAlertExplanation(session.user.id, alertId, await request.json()) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Explanation could not be submitted.' }, { status: 400 });
  }
}
