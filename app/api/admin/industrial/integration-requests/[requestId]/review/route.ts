import { NextResponse } from 'next/server';
import { reviewIndustrialIntegrationRequest } from '@/lib/actions/industrial.action';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ requestId: string }> }): Promise<NextResponse> {
  try {
    const { requestId } = await context.params;
    const body: unknown = await request.json();
    const record = typeof body === 'object' && body !== null && !Array.isArray(body) ? body as Record<string, unknown> : {};
    return NextResponse.json({ result: await reviewIndustrialIntegrationRequest({ ...record, requestId }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Integration review failed.' }, { status: 400 });
  }
}
