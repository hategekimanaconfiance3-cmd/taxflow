import { NextResponse } from 'next/server';
import { consumeRateLimit, getRequestIdentity } from '@/lib/rate-limit';
import { receiveIndustrialDiagnostics } from '@/lib/actions/industrial.action';
import type { GatewayRequestSecurity } from '@/lib/industrial-security';

export const runtime = 'nodejs';

function bearerSecret(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const secret = header.slice('Bearer '.length).trim();
  return secret.length >= 32 ? secret : null;
}

export async function GET(request: Request): Promise<NextResponse> {
  const ipRate = await consumeRateLimit('industrial-diagnostics-ip', getRequestIdentity(request.headers), 120, 60).catch(() => ({ allowed: true, retryAfterSeconds: 0 }));
  if (!ipRate.allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429, headers: { 'Retry-After': String(ipRate.retryAfterSeconds) } });

  const secret = bearerSecret(request);
  if (!secret) return NextResponse.json({ error: 'Gateway authentication is required.' }, { status: 401 });
  const url = new URL(request.url);
  const gatewayId = url.searchParams.get('gatewayId');
  if (!gatewayId) return NextResponse.json({ error: 'gatewayId query parameter is required.' }, { status: 400 });
  try {
    const security: GatewayRequestSecurity = { method: request.method, path: `${url.pathname}${url.search}`, rawBody: '', timestamp: request.headers.get('x-tf-timestamp'), nonce: request.headers.get('x-tf-nonce'), keyVersion: request.headers.get('x-tf-key-version'), signatureVersion: request.headers.get('x-tf-signature-version'), signature: request.headers.get('x-tf-signature') };
    return NextResponse.json(await receiveIndustrialDiagnostics(gatewayId, secret, security));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Diagnostics could not be loaded.';
    return NextResponse.json({ error: message }, { status: message.includes('rate limit') ? 429 : 401 });
  }
}
