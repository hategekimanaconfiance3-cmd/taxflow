import { NextResponse } from 'next/server';
import { consumeRateLimit, getRequestIdentity } from '@/lib/rate-limit';
import { receiveIndustrialEvent } from '@/lib/actions/industrial.action';

export const runtime = 'nodejs';

function bearerSecret(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const secret = header.slice('Bearer '.length).trim();
  return secret.length >= 32 ? secret : null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const secret = bearerSecret(request);
  if (!secret) return NextResponse.json({ error: 'Gateway authentication is required.' }, { status: 401 });
  try {
    const body: unknown = await request.json();
    const gatewayId = typeof body === 'object' && body !== null && !Array.isArray(body) && typeof (body as Record<string, unknown>).gatewayId === 'string'
      ? (body as Record<string, unknown>).gatewayId as string
      : 'unknown';
    const clientRate = await consumeRateLimit('industrial-event-client', getRequestIdentity(request.headers), 120, 60);
    if (!clientRate.allowed) return NextResponse.json({ error: 'Industrial event client rate limit exceeded.' }, { status: 429, headers: { 'Retry-After': String(clientRate.retryAfterSeconds) } });
    const rate = await consumeRateLimit('industrial-event', gatewayId, 6_000, 60);
    if (!rate.allowed) return NextResponse.json({ error: 'Industrial event rate limit exceeded.' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } });
    return NextResponse.json(await receiveIndustrialEvent(body, secret), { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Industrial event could not be accepted.';
    return NextResponse.json({ error: message }, { status: message.includes('authentication') || message.includes('authorized') ? 401 : 400 });
  }
}
