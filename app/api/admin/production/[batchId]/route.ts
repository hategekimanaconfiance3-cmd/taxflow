import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { authorizeRRAPermissionForRequest } from '@/lib/auth-guard';
import { getProductionComplianceDetail } from '@/lib/production-service';
import { logAudit } from '@/lib/audit';

export async function GET(_request: Request, context: { params: Promise<{ batchId: string }> }): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const access = await authorizeRRAPermissionForRequest('stock.read', _request.headers);
    if (!access.authorized) return NextResponse.json({ error: access.status === 401 ? 'Sign in with an authorized RRA account.' : 'You do not have permission to view production monitoring details.' }, { status: access.status, headers: { 'x-request-id': requestId } });
    const { batchId } = await context.params;
    const detail = await getProductionComplianceDetail(batchId);
    if (!detail) return NextResponse.json({ error: 'Production batch not found.' }, { status: 404, headers: { 'x-request-id': requestId } });
    await logAudit({
      userId: access.userId,
      action: 'PRODUCTION_COMPLIANCE_RECORD_VIEWED',
      targetType: 'production_batch',
      targetId: batchId,
      metadata: { materialCount: detail.materials.length },
    });
    return NextResponse.json({ production: detail }, { headers: { 'x-request-id': requestId } });
  } catch (error) {
    console.error('[admin:production:compliance]', { requestId, errorName: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ error: 'Unable to load production details.', requestId }, { status: 500, headers: { 'x-request-id': requestId } });
  }
}
