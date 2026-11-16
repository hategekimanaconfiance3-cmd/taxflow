import { NextResponse } from 'next/server';
import { evaluateIndustrialIntegrationCompliance } from '@/lib/actions/industrial.action';

export const runtime = 'nodejs';

export async function POST(_request: Request, context: { params: Promise<{ factoryId: string }> }): Promise<NextResponse> {
  try {
    const { factoryId } = await context.params;
    return NextResponse.json({ compliance: await evaluateIndustrialIntegrationCompliance(factoryId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Compliance evaluation failed.' }, { status: 400 });
  }
}
