import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeRRAPermissionForRequest } from '@/lib/auth-guard';
import { getConfidentialProductionMaterials } from '@/lib/production-service';

const accessSchema = z.object({ reason: z.string().trim().min(10).max(1000) });

export async function POST(request: Request, context: { params: Promise<{ batchId: string }> }): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const access = await authorizeRRAPermissionForRequest('production.recipe.confidential.read', request.headers);
    if (!access.authorized) return NextResponse.json({ error: access.status === 401 ? 'Sign in with an authorized RRA account.' : 'You do not have permission to access confidential formula details.' }, { status: access.status, headers: { 'x-request-id': requestId } });
    let body: unknown;
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: 'Provide a documented access reason.' }, { status: 400, headers: { 'x-request-id': requestId } });
    }
    const parsed = accessSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Provide a reason of at least 10 characters.' }, { status: 400, headers: { 'x-request-id': requestId } });
    }
    const { batchId } = await context.params;
    const materials = await getConfidentialProductionMaterials(batchId, access.userId, parsed.data.reason);
    if (!materials) return NextResponse.json({ error: 'Production batch not found.' }, { status: 404, headers: { 'x-request-id': requestId } });
    return NextResponse.json({ materials }, { headers: { 'x-request-id': requestId } });
  } catch (error) {
    console.error('[admin:production:confidential-access]', { requestId, errorName: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ error: 'Unable to retrieve confidential material details.', requestId }, { status: 500, headers: { 'x-request-id': requestId } });
  }
}
