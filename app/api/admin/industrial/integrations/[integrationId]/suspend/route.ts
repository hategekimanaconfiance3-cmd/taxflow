import { NextResponse } from 'next/server';
import { suspendIndustrialIntegration } from '@/lib/actions/industrial.action';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ integrationId: string }> }): Promise<NextResponse> {
  try {
    const { integrationId } = await context.params;
    const body: unknown = await request.json();
    const record = typeof body === 'object' && body !== null && !Array.isArray(body) ? body as Record<string, unknown> : {};
    return NextResponse.json({ integration: await suspendIndustrialIntegration({ ...record, integrationId }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Integration suspension failed.' }, { status: 400 });
  }
}
