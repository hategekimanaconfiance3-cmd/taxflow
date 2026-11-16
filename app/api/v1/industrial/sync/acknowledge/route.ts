import { NextResponse } from 'next/server';
import { receiveIndustrialAcknowledgements } from '@/lib/actions/industrial.action';

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
    const record = typeof body === 'object' && body !== null && !Array.isArray(body) ? body as Record<string, unknown> : {};
    const gatewayId = typeof record.gatewayId === 'string' ? record.gatewayId : '';
    const eventIds = Array.isArray(record.eventIds) && record.eventIds.every((value) => typeof value === 'string') ? record.eventIds as string[] : [];
    if (!gatewayId) return NextResponse.json({ error: 'Gateway identifier is required.' }, { status: 400 });
    return NextResponse.json(await receiveIndustrialAcknowledgements(gatewayId, secret, eventIds));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Acknowledgement failed.' }, { status: 401 });
  }
}
