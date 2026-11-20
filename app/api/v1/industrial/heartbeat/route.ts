import { NextResponse } from 'next/server';
import { receiveIndustrialHeartbeat } from '@/lib/actions/industrial.action';
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
    const gatewayId = typeof body === 'object' && body !== null && !Array.isArray(body) && typeof (body as Record<string, unknown>).gatewayId === 'string'
      ? (body as Record<string, unknown>).gatewayId as string
      : '';
    if (!gatewayId) return NextResponse.json({ error: 'Gateway identifier is required.' }, { status: 400 });
    const security: GatewayRequestSecurity = { method: request.method, path: new URL(request.url).pathname, rawBody, timestamp: request.headers.get('x-tf-timestamp'), nonce: request.headers.get('x-tf-nonce'), keyVersion: request.headers.get('x-tf-key-version'), signatureVersion: request.headers.get('x-tf-signature-version'), signature: request.headers.get('x-tf-signature') };
    return NextResponse.json(await receiveIndustrialHeartbeat(gatewayId, secret, body, security));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gateway heartbeat failed.';
    return NextResponse.json({ error: message }, { status: message.includes('rate limit') ? 429 : 401 });
  }
}
