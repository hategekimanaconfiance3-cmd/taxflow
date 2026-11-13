import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createManufacturerRecipe, listManufacturerRecipes } from '@/lib/production-service';
import { productionRecipeSchema } from '@/lib/validation/production.schema';

function json(body: unknown, status: number, requestId: string): NextResponse {
  return NextResponse.json(body, { status, headers: { 'x-request-id': requestId } });
}

async function getManufacturerId(request: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || session.user.role !== 'manufacturer') return null;
  return session.user.id;
}

export async function GET(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const manufacturerId = await getManufacturerId(request);
    if (!manufacturerId) return json({ error: 'Manufacturer sign-in is required.' }, 403, requestId);
    const recipes = await listManufacturerRecipes(manufacturerId);
    return json({ recipes }, 200, requestId);
  } catch (error) {
    console.error('[production-recipes:read]', {
      requestId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return json({ error: 'Unable to load recipes.', requestId }, 500, requestId);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const manufacturerId = await getManufacturerId(request);
    if (!manufacturerId) return json({ error: 'Manufacturer sign-in is required.' }, 403, requestId);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Enter valid recipe details.' }, 400, requestId);
    }
    const parsed = productionRecipeSchema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Enter valid recipe details.' }, 400, requestId);

    const result = await createManufacturerRecipe(manufacturerId, parsed.data);
    if (!result.ok && result.code === 'PRODUCT_NOT_FOUND') {
      return json({ error: 'Product not found or not registered to your manufacturer account.' }, 404, requestId);
    }
    if (!result.ok && result.code === 'MATERIAL_UNIT_MISMATCH') {
      return json({ error: 'This material already exists with a different unit. Use its existing unit for consistent history.' }, 409, requestId);
    }
    if (!result.ok) return json({ error: 'Unable to create this recipe version.' }, 400, requestId);
    return json({ recipe: result.recipe }, 201, requestId);
  } catch (error) {
    const databaseCode = typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : undefined;
    const constraint = typeof error === 'object' && error !== null && 'constraint' in error
      ? String(error.constraint)
      : undefined;
    console.error('[production-recipes:create]', {
      requestId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorCode: databaseCode,
      constraint,
    });
    const errorMessage = databaseCode === '42P01' || databaseCode === '42703'
      ? 'Recipe storage is not fully available. Contact an administrator and provide the reference below.'
      : databaseCode === '23505'
        ? 'A recipe version conflict occurred. Refresh the page and try again.'
        : 'Unable to create this recipe version. Contact support with the reference below.';
    return json({ error: errorMessage, requestId }, 500, requestId);
  }
}
