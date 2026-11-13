import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { requireRRAPermission } from '@/lib/auth-guard';
import { getProductionBatchMaterialTraceability, MaterialAccountingError } from '@/lib/material-accounting-service';
import { productionBatchTraceabilityQuerySchema } from '@/lib/validation/production.schema';

export async function GET(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401, headers: { 'x-request-id': requestId } });
    if (session.user.isActive === false) return NextResponse.json({ error: 'This account is inactive.' }, { status: 403, headers: { 'x-request-id': requestId } });

    const parsed = productionBatchTraceabilityQuerySchema.safeParse({ batchId: new URL(request.url).searchParams.get('batchId') });
    if (!parsed.success) return NextResponse.json({ error: 'Enter a valid production batch reference.' }, { status: 400, headers: { 'x-request-id': requestId } });

    if (session.user.role === 'manufacturer') {
      const traceability = await getProductionBatchMaterialTraceability(parsed.data.batchId, session.user.id);
      return NextResponse.json(traceability, { headers: { 'x-request-id': requestId } });
    }
    await requireRRAPermission('production.batch.review');
    const traceability = await getProductionBatchMaterialTraceability(parsed.data.batchId);
    return NextResponse.json(traceability, { headers: { 'x-request-id': requestId } });
  } catch (error) {
    if (error instanceof MaterialAccountingError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === 'NOT_FOUND' ? 404 : 409, headers: { 'x-request-id': requestId } });
    console.error('[production-traceability:read]', { requestId, errorName: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ error: 'Unable to load production material traceability.', requestId }, { status: 500, headers: { 'x-request-id': requestId } });
  }
}
