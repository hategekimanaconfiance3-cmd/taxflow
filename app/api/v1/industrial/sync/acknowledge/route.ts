import { NextResponse } from 'next/server';
import { receiveIndustrialAcknowledgements } from '@/lib/actions/industrial.action';
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
    const record = typeof body === 'object' && body !== null && !Array.isArray(body) ? body as Record<string, unknown> : {};
    const gatewayId = typeof record.gatewayId === 'string' ? record.gatewayId : '';
    const eventIds = Array.isArray(record.eventIds) && record.eventIds.every((value) => typeof value === 'string') ? record.eventIds as string[] : [];
    if (!gatewayId) return NextResponse.json({ error: 'Gateway identifier is required.' }, { status: 400 });
    const security: GatewayRequestSecurity = { method: request.method, path: new URL(request.url).pathname, rawBody, timestamp: request.headers.get('x-tf-timestamp'), nonce: request.headers.get('x-tf-nonce'), keyVersion: request.headers.get('x-tf-key-version'), signatureVersion: request.headers.get('x-tf-signature-version'), signature: request.headers.get('x-tf-signature') };
    return NextResponse.json(await receiveIndustrialAcknowledgements(gatewayId, secret, eventIds, security));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Acknowledgement failed.' }, { status: 401 });
  }
}
