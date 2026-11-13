import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { MaterialAccountingError, adjustProductionMaterialStock } from '@/lib/material-accounting-service';
import { requireRRAPermission } from '@/lib/auth-guard';
import { productionMaterialAdjustmentSchema } from '@/lib/validation/production.schema';

function json(body: unknown, status: number, requestId: string): NextResponse {
  return NextResponse.json(body, { status, headers: { 'x-request-id': requestId } });
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const { user } = await requireRRAPermission('production.material.adjust');
    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: 'Enter valid adjustment details.' }, 400, requestId); }
    const parsed = productionMaterialAdjustmentSchema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Enter valid adjustment details.' }, 400, requestId);
    return json({ adjustment: await adjustProductionMaterialStock(user.id, parsed.data) }, 201, requestId);
  } catch (error) {
    if (error instanceof MaterialAccountingError) return json({ error: error.message, code: error.code }, 409, requestId);
    console.error('[admin-production-material-adjustment]', { requestId, errorName: error instanceof Error ? error.name : 'UnknownError' });
    return json({ error: 'Unable to record this material adjustment.', requestId }, 500, requestId);
  }
}
