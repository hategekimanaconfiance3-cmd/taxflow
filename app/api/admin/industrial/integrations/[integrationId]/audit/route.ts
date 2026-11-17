import { NextResponse } from 'next/server';
import { getIndustrialIntegrationAuditForOfficer } from '@/lib/actions/industrial.action';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ integrationId: string }> }): Promise<NextResponse> {
  try {
    const { integrationId } = await context.params;
    return NextResponse.json({ audit: await getIndustrialIntegrationAuditForOfficer(integrationId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Integration audit could not be loaded.' }, { status: 401 });
  }
}
