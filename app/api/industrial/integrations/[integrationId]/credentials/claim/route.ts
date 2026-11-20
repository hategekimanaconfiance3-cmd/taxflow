import { NextResponse } from 'next/server';
import { claimMyIndustrialIntegrationCredentials } from '@/lib/actions/industrial.action';

export const runtime = 'nodejs';

export async function POST(_request: Request, context: { params: Promise<{ integrationId: string }> }): Promise<NextResponse> {
  try {
    const { integrationId } = await context.params;
    const credentials = await claimMyIndustrialIntegrationCredentials(integrationId);
    return NextResponse.json({ credentials }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Credentials could not be claimed.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
}
