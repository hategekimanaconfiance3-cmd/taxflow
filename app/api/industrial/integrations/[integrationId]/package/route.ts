import { NextResponse } from 'next/server';
import { getMyIndustrialIntegrationPackage } from '@/lib/actions/industrial.action';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ integrationId: string }> }): Promise<NextResponse> {
  try {
    const { integrationId } = await context.params;
    return NextResponse.json({ package: await getMyIndustrialIntegrationPackage(integrationId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Integration package could not be loaded.' }, { status: 400 });
  }
}
