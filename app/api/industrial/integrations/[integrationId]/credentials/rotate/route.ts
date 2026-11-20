import { NextResponse } from 'next/server';
import { rotateMyIndustrialIntegrationCredential } from '@/lib/actions/industrial.action';

export const runtime = 'nodejs';

export async function POST(_request: Request, context: { params: Promise<{ integrationId: string }> }): Promise<NextResponse> {
  try {
    const { integrationId } = await context.params;
    return NextResponse.json({ rotation: await rotateMyIndustrialIntegrationCredential(integrationId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Credential rotation failed.' }, { status: 400 });
  }
}
