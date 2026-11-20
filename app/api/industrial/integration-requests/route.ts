import { NextResponse } from 'next/server';
import { getMyIndustrialIntegrationRequests, requestIndustrialIntegration } from '@/lib/actions/industrial.action';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ requests: await getMyIndustrialIntegrationRequests() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Integration requests could not be loaded.' }, { status: 401 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    return NextResponse.json({ request: await requestIndustrialIntegration(await request.json()) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Integration request failed.' }, { status: 400 });
  }
}
