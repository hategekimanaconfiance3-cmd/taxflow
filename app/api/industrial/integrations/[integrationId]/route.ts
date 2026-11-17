import { NextResponse } from 'next/server';
import { getMyIndustrialIntegration } from '@/lib/actions/industrial.action';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ integrationId: string }> }): Promise<NextResponse> {
  try {
    const { integrationId } = await context.params;
    return NextResponse.json(await getMyIndustrialIntegration(integrationId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Integration could not be loaded.' }, { status: 400 });
  }
}
