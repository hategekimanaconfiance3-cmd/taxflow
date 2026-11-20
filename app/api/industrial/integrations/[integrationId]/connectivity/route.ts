import { NextResponse } from 'next/server';
import { testMyIndustrialIntegrationConnectivity } from '@/lib/actions/industrial.action';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, context: { params: Promise<{ integrationId: string }> }): Promise<NextResponse> {
  try {
    const { integrationId } = await context.params;
    return NextResponse.json({ connectivity: await testMyIndustrialIntegrationConnectivity(integrationId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Integration connectivity test failed.' }, { status: 400 });
  }
}
