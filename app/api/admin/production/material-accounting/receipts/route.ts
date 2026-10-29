import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { MaterialAccountingError, listPendingProductionMaterialReceipts, reviewProductionMaterialReceipt } from '@/lib/material-accounting-service';
import { requireRRAPermission } from '@/lib/auth-guard';
import { productionMaterialReceiptReviewSchema } from '@/lib/validation/production.schema';

function json(body: unknown, status: number, requestId: string): NextResponse {
  return NextResponse.json(body, { status, headers: { 'x-request-id': requestId } });
}

export async function GET(): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    await requireRRAPermission('production.material.receipt.review');
    return json({ receipts: await listPendingProductionMaterialReceipts() }, 200, requestId);
  } catch (error) {
    console.error('[admin-material-receipts:read]', { requestId, errorName: error instanceof Error ? error.name : 'UnknownError' });
    return json({ error: 'Unable to load material receipt reviews.', requestId }, 500, requestId);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const { user } = await requireRRAPermission('production.material.receipt.review');
    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: 'Enter a valid review decision.' }, 400, requestId); }
    const parsed = productionMaterialReceiptReviewSchema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Enter a valid review decision.' }, 400, requestId);
    return json({ result: await reviewProductionMaterialReceipt(user.id, parsed.data) }, 200, requestId);
  } catch (error) {
    if (error instanceof MaterialAccountingError) return json({ error: error.message, code: error.code }, 409, requestId);
    console.error('[admin-material-receipts:review]', { requestId, errorName: error instanceof Error ? error.name : 'UnknownError' });
    return json({ error: 'Unable to record this material receipt review.', requestId }, 500, requestId);
  }
}
