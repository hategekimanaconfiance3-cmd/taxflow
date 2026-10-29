import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createManufacturerMaterialPlan, listManufacturerMaterialPlans, MaterialAccountingError } from '@/lib/material-accounting-service';
import { productionMaterialPlanSchema } from '@/lib/validation/production.schema';

function json(body: unknown, status: number, requestId: string): NextResponse {
  return NextResponse.json(body, { status, headers: { 'x-request-id': requestId } });
}

async function getManufacturer(request: Request, requestId: string): Promise<string | NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return json({ error: 'Sign in to continue.' }, 401, requestId);
  if (session.user.role !== 'manufacturer') return json({ error: 'Production plans are available only to manufacturers.' }, 403, requestId);
  return session.user.id;
}

export async function GET(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const manufacturer = await getManufacturer(request, requestId);
    if (manufacturer instanceof NextResponse) return manufacturer;
    return json({ plans: await listManufacturerMaterialPlans(manufacturer) }, 200, requestId);
  } catch (error) {
    console.error('[production-plans:read]', { requestId, errorName: error instanceof Error ? error.name : 'UnknownError' });
    return json({ error: 'Unable to load production plans.', requestId }, 500, requestId);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const manufacturer = await getManufacturer(request, requestId);
    if (manufacturer instanceof NextResponse) return manufacturer;
    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: 'Enter valid plan details.' }, 400, requestId); }
    const parsed = productionMaterialPlanSchema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Enter valid plan details.' }, 400, requestId);
    const plan = await createManufacturerMaterialPlan(manufacturer, parsed.data);
    return json({ plan }, plan.replayed ? 200 : 201, requestId);
  } catch (error) {
    if (error instanceof MaterialAccountingError) return json({ error: error.message, code: error.code }, 409, requestId);
    console.error('[production-plans:create]', { requestId, errorName: error instanceof Error ? error.name : 'UnknownError' });
    return json({ error: 'Unable to save production plan.', requestId }, 500, requestId);
  }
}
