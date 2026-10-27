import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { listManufacturerProduction, recordManufacturerProduction } from '@/lib/production-service';
import { productionEntrySchema } from '@/lib/validation/production.schema';

function diagnostic(operation: string, requestId: string, error: unknown): void {
  if (process.env.NODE_ENV !== 'production') {
    console.error(`[production:${operation}] requestId=${requestId}`, error);
    return;
  }

  const errorName = error instanceof Error ? error.name : 'UnknownError';
  const errorCode = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined;
  console.error(`[production:${operation}]`, { requestId, errorName, errorCode });
}

function json(body: unknown, status: number, requestId: string): NextResponse {
  return NextResponse.json(body, { status, headers: { 'x-request-id': requestId } });
}

async function manufacturerSession(request: Request, requestId: string) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return { authorized: false as const, response: json({ error: 'Sign in to continue.' }, 401, requestId) };
  if (session.user.role !== 'manufacturer') {
    return {
      authorized: false as const,
      response: json({
        error: 'Production access restricted. Only authorized manufacturers can record production.',
      }, 403, requestId),
    };
  }
  return { authorized: true as const, userId: session.user.id };
}

export async function GET(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const access = await manufacturerSession(request, requestId);
    if (!access.authorized) return access.response;

    const records = await listManufacturerProduction(access.userId);
    return json({ records }, 200, requestId);
  } catch (error) {
    diagnostic('history', requestId, error);
    return json({ error: 'Unable to load production history. Please try again.', requestId }, 500, requestId);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const access = await manufacturerSession(request, requestId);
    if (!access.authorized) return access.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Enter valid production details.' }, 400, requestId);
    }

    const parsed = productionEntrySchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? 'Enter valid production details.' }, 400, requestId);
    }

    const result = await recordManufacturerProduction(access.userId, parsed.data);
    if (!result.ok && result.code === 'PRODUCT_NOT_FOUND') {
      return json({ error: 'Product not found or not registered to your manufacturer account.' }, 404, requestId);
    }
    if (!result.ok && result.code === 'RECIPE_NOT_FOUND') {
      return json({ error: 'The selected recipe was not found for this product.' }, 404, requestId);
    }
    if (!result.ok && result.code === 'MATERIAL_USAGE_MISMATCH') {
      return json({ error: 'Enter actual quantities for every material in the selected recipe.' }, 422, requestId);
    }
    if (!result.ok) {
      return json({ error: 'This submission could not be matched to the earlier request. Refresh before retrying.' }, 409, requestId);
    }

    return json({ record: result.record, replayed: result.replayed }, result.replayed ? 200 : 201, requestId);
  } catch (error) {
    diagnostic('save', requestId, error);
    return json({ error: 'Unable to save production. Something went wrong while recording this production. Please try again.', requestId }, 500, requestId);
  }
}
