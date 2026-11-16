import { NextResponse } from 'next/server';
import { receiveIndustrialDiagnostics } from '@/lib/actions/industrial.action';

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
    return NextResponse.json(await receiveIndustrialDiagnostics(gatewayId, secret));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Diagnostics could not be loaded.' }, { status: 401 });
  }
}
