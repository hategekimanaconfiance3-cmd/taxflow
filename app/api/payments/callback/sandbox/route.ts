import { NextRequest, NextResponse } from 'next/server';
import { reconcileProviderCallback } from '@/lib/payment-engine/reconcile';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  if (rawBody.length > 16_384) return NextResponse.json({ error: 'Callback rejected.' }, { status: 413 });
  try {
    const result = await reconcileProviderCallback('mtn_mobile_money', rawBody, request.headers.get('x-taxflow-simulator-signature'));
    return NextResponse.json({ accepted: true, result }, { status: result === 'unknown' ? 404 : 200 });
  } catch (error) {
    console.error('Sandbox payment callback rejected', { reason: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ error: 'Callback rejected.' }, { status: 401 });
  }
}
