import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { MaterialAccountingError, listPendingProductionBatchReviews, reviewProductionBatch } from '@/lib/material-accounting-service';
import { requireRRAPermission } from '@/lib/auth-guard';
import { productionBatchMaterialReviewSchema } from '@/lib/validation/production.schema';

function json(body: unknown, status: number, requestId: string): NextResponse {
  return NextResponse.json(body, { status, headers: { 'x-request-id': requestId } });
}

export async function GET(): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    await requireRRAPermission('production.batch.review');
    return json({ batches: await listPendingProductionBatchReviews() }, 200, requestId);
  } catch (error) {
    console.error('[admin-production-batch-review:read]', { requestId, errorName: error instanceof Error ? error.name : 'UnknownError' });
    return json({ error: 'Unable to load production batch reviews.', requestId }, 500, requestId);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const { user } = await requireRRAPermission('production.batch.review');
    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: 'Enter a valid batch decision.' }, 400, requestId); }
    const parsed = productionBatchMaterialReviewSchema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Enter a valid batch decision.' }, 400, requestId);
    return json({ result: await reviewProductionBatch(user.id, parsed.data) }, 200, requestId);
  } catch (error) {
    if (error instanceof MaterialAccountingError) return json({ error: error.message, code: error.code }, 409, requestId);
    console.error('[admin-production-batch-review:decision]', { requestId, errorName: error instanceof Error ? error.name : 'UnknownError' });
    return json({ error: 'Unable to record this batch review.', requestId }, 500, requestId);
  }
}
