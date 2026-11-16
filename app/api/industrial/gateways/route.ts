import { NextResponse } from 'next/server';
import { getMyIndustrialGateways, registerIndustrialGateway } from '@/lib/actions/industrial.action';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ gateways: await getMyIndustrialGateways() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Gateways could not be loaded.' }, { status: 401 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    return NextResponse.json({ registration: await registerIndustrialGateway(await request.json()) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Gateway registration failed.' }, { status: 400 });
  }
}
