import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireRRAPermission } from '@/lib/auth-guard';
import { ProductionToleranceError, transitionProductionTolerance } from '@/lib/production-tolerance-service';
import { productionToleranceStandardDecisionSchema } from '@/lib/validation/production.schema';

function json(body: unknown, status: number, requestId: string): NextResponse {
  return NextResponse.json(body, { status, headers: { 'x-request-id': requestId } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const { user, staff } = await requireRRAPermission('production.tolerance.govern');
    if (!staff.clearanceRoles.includes('super_admin')) return json({ error: 'Super Admin authorization is required.' }, 403, requestId);
    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: 'Enter a valid tolerance decision.' }, 400, requestId); }
    const parsed = productionToleranceStandardDecisionSchema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Enter a valid tolerance decision.' }, 400, requestId);
    const { id } = await context.params;
    return json({ standard: await transitionProductionTolerance(user.id, id, parsed.data) }, 200, requestId);
  } catch (error) {
    if (error instanceof ProductionToleranceError) return json({ error: error.message, code: error.code }, error.code === 'FORBIDDEN' ? 403 : 409, requestId);
    console.error('[production-tolerances:decision]', { requestId, errorName: error instanceof Error ? error.name : 'UnknownError' });
    return json({ error: 'Unable to update this tolerance version.', requestId }, 500, requestId);
  }
}
