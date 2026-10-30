import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { pollDueSimulatedPayments } from '@/lib/payment-engine/polling';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.PAYMENT_POLL_CRON_SECRET;
  const authorization = request.headers.get('authorization') ?? '';
  if (!secret || secret.length < 32 || !authorization.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const provided = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json({ success: true, simulated: true, ...(await pollDueSimulatedPayments()) });
  } catch (error) {
    console.error('Durable simulated payment polling failed', { reason: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ error: 'Polling failed.' }, { status: 500 });
  }
}
