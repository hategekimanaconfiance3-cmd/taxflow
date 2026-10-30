import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireRRAPermission } from '@/lib/auth-guard';
import { ProductionToleranceError, createProductionToleranceDraft, listProductionToleranceGovernance } from '@/lib/production-tolerance-service';
import { productionToleranceStandardCreateSchema } from '@/lib/validation/production.schema';

function json(body: unknown, status: number, requestId: string): NextResponse {
  return NextResponse.json(body, { status, headers: { 'x-request-id': requestId } });
}

async function authorize() {
  const session = await requireRRAPermission('production.tolerance.govern');
  return session.staff.clearanceRoles.includes('super_admin') ? session : null;
}

export async function GET(): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const session = await authorize();
    if (!session) return json({ error: 'Super Admin authorization is required.' }, 403, requestId);
    return json(await listProductionToleranceGovernance(session.user.id), 200, requestId);
  } catch (error) {
    console.error('[production-tolerances:read]', { requestId, errorName: error instanceof Error ? error.name : 'UnknownError' });
    return json({ error: 'Unable to load manufacturing tolerance governance.', requestId }, 500, requestId);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const session = await authorize();
    if (!session) return json({ error: 'Super Admin authorization is required.' }, 403, requestId);
    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: 'Enter valid tolerance version details.' }, 400, requestId); }
    const parsed = productionToleranceStandardCreateSchema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Enter valid tolerance version details.' }, 400, requestId);
    return json({ standard: await createProductionToleranceDraft(session.user.id, parsed.data) }, 201, requestId);
  } catch (error) {
    if (error instanceof ProductionToleranceError) return json({ error: error.message, code: error.code }, error.code === 'FORBIDDEN' ? 403 : 409, requestId);
    console.error('[production-tolerances:create]', { requestId, errorName: error instanceof Error ? error.name : 'UnknownError' });
    return json({ error: 'Unable to create the tolerance version.', requestId }, 500, requestId);
  }
}
