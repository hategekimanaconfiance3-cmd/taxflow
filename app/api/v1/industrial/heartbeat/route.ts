import { NextResponse } from 'next/server';
import { receiveIndustrialHeartbeat } from '@/lib/actions/industrial.action';

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
      : '';
    if (!gatewayId) return NextResponse.json({ error: 'Gateway identifier is required.' }, { status: 400 });
    return NextResponse.json(await receiveIndustrialHeartbeat(gatewayId, secret, body));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Gateway heartbeat failed.' }, { status: 401 });
  }
}
