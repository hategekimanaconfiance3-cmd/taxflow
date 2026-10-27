import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createManufacturerMaterial, listManufacturerMaterials } from '@/lib/production-service';
import { manufacturingMaterialSchema } from '@/lib/validation/production.schema';

function response(body: unknown, status = 200, requestId = randomUUID()) {
  return NextResponse.json(body, { status, headers: { 'x-request-id': requestId } });
}

async function manufacturer(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return { id: null, denied: response({ error: 'Sign in to continue.' }, 401) };
  if (session.user.role !== 'manufacturer') return { id: null, denied: response({ error: 'Manufacturer access is required.' }, 403) };
  return { id: session.user.id, denied: null };
}

export async function GET(request: Request): Promise<NextResponse> {
  const access = await manufacturer(request);
  if (access.denied || !access.id) return access.denied ?? response({ error: 'Manufacturer access is required.' }, 403);
  try {
    return response({ materials: await listManufacturerMaterials(access.id) });
  } catch (error) {
    console.error('[manufacturing:materials:list]', { requestId: randomUUID(), errorName: error instanceof Error ? error.name : 'UnknownError' });
    return response({ error: 'Unable to load materials. Please try again.' }, 500);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const access = await manufacturer(request);
  if (access.denied || !access.id) return access.denied ?? response({ error: 'Manufacturer access is required.' }, 403);
  let body: unknown;
  try { body = await request.json(); } catch { return response({ error: 'Enter valid material details.' }, 400); }
  const parsed = manufacturingMaterialSchema.safeParse(body);
  if (!parsed.success) return response({ error: parsed.error.issues[0]?.message ?? 'Enter valid material details.' }, 400);
  try {
    return response({ material: await createManufacturerMaterial(access.id, parsed.data) }, 201);
  } catch (error) {
    console.error('[manufacturing:materials:create]', { requestId: randomUUID(), errorName: error instanceof Error ? error.name : 'UnknownError' });
    return response({ error: 'Unable to save material. Please try again.' }, 500);
  }
}
