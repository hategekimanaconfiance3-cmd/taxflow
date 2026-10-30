import { NextRequest, NextResponse } from 'next/server';
import { reconcileProviderCallback } from './reconcile';
import type { SimulatedProviderName } from './provider';

export async function handleSimulatedProviderCallback(request: NextRequest, provider: SimulatedProviderName): Promise<NextResponse> {
  const rawBody = await request.text();
  if (rawBody.length > 16_384) return NextResponse.json({ error: 'Callback rejected.' }, { status: 413 });
  try {
    const result = await reconcileProviderCallback(provider, rawBody, request.headers.get('x-taxflow-simulator-signature'));
    return NextResponse.json({ accepted: true, simulated: true, result }, { status: result === 'unknown' ? 404 : 200 });
  } catch (error) {
    console.error('Simulated payment callback rejected', { provider, reason: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ error: 'Callback rejected.' }, { status: 401 });
  }
}
