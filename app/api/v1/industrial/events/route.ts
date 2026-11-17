import { NextResponse } from 'next/server';
import { consumeRateLimit, getRequestIdentity } from '@/lib/rate-limit';
import { receiveIndustrialEvent } from '@/lib/actions/industrial.action';
import type { GatewayRequestSecurity } from '@/lib/industrial-security';

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
    const rawBody = await request.text();
    const body: unknown = JSON.parse(rawBody);
    const clientRate = await consumeRateLimit('industrial-event-client', getRequestIdentity(request.headers), 120, 60);
    if (!clientRate.allowed) return NextResponse.json({ error: 'Industrial event client rate limit exceeded.' }, { status: 429, headers: { 'Retry-After': String(clientRate.retryAfterSeconds) } });
    const security: GatewayRequestSecurity = {
      method: request.method,
      path: new URL(request.url).pathname,
      rawBody,
      timestamp: request.headers.get('x-tf-timestamp'),
      nonce: request.headers.get('x-tf-nonce'),
      keyVersion: request.headers.get('x-tf-key-version'),
      signatureVersion: request.headers.get('x-tf-signature-version'),
      signature: request.headers.get('x-tf-signature'),
    };
    return NextResponse.json(await receiveIndustrialEvent(body, secret, security), { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Industrial event could not be accepted.';
    const status = message.includes('rate limit') ? 429 : message.includes('authentication') || message.includes('authorized') || message.includes('replay') ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
