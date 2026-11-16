import { NextResponse } from 'next/server';
import { verifyIndustrialBatch } from '@/lib/actions/industrial.action';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ batchId: string }> }): Promise<NextResponse> {
  try {
    const { batchId } = await context.params;
    const body: unknown = await request.json().catch(() => ({}));
    const tolerancePercent = typeof body === 'object' && body !== null && !Array.isArray(body) && typeof (body as Record<string, unknown>).tolerancePercent === 'number'
      ? (body as Record<string, unknown>).tolerancePercent as number
      : undefined;
    return NextResponse.json({ result: await verifyIndustrialBatch(batchId, tolerancePercent) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Batch verification failed.' }, { status: 400 });
  }
}
