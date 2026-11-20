import { NextResponse } from 'next/server';
import { getMyIndustrialIntegrationEvents } from '@/lib/actions/industrial.action';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ integrationId: string }> }): Promise<NextResponse> {
  try {
    const { integrationId } = await context.params;
    const limit = Number(new URL(request.url).searchParams.get('limit') ?? '100');
    return NextResponse.json({ events: await getMyIndustrialIntegrationEvents(integrationId, Number.isFinite(limit) ? limit : 100) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Integration events could not be loaded.' }, { status: 400 });
  }
}
