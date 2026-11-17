import { NextResponse } from 'next/server';
import { activateIndustrialIntegration } from '@/lib/actions/industrial.action';

export const runtime = 'nodejs';

export async function POST(_request: Request, context: { params: Promise<{ integrationId: string }> }): Promise<NextResponse> {
  try {
    const { integrationId } = await context.params;
    return NextResponse.json({ integration: await activateIndustrialIntegration(integrationId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Integration activation failed.' }, { status: 400 });
  }
}
