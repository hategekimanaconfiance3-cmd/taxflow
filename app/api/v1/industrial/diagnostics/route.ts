import { NextResponse } from 'next/server';
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
  const secret = bearerSecret(request);
  if (!secret) return NextResponse.json({ error: 'Gateway authentication is required.' }, { status: 401 });
  const gatewayId = new URL(request.url).searchParams.get('gatewayId');
  if (!gatewayId) return NextResponse.json({ error: 'Gateway identifier is required.' }, { status: 400 });
  try {
    const security: GatewayRequestSecurity = { method: request.method, path: `${new URL(request.url).pathname}${new URL(request.url).search}`, rawBody: '', timestamp: request.headers.get('x-tf-timestamp'), nonce: request.headers.get('x-tf-nonce'), keyVersion: request.headers.get('x-tf-key-version'), signatureVersion: request.headers.get('x-tf-signature-version'), signature: request.headers.get('x-tf-signature') };
    return NextResponse.json(await receiveIndustrialDiagnostics(gatewayId, secret, security));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Diagnostics could not be loaded.' }, { status: 401 });
  }
}
