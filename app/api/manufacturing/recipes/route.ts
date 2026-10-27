import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createManufacturerRecipe, listManufacturerRecipes } from '@/lib/production-service';
import { manufacturingRecipeSchema } from '@/lib/validation/production.schema';

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'x-request-id': randomUUID() } });
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
    return response({ recipes: await listManufacturerRecipes(access.id) });
  } catch (error) {
    console.error('[manufacturing:recipes:list]', { requestId: randomUUID(), errorName: error instanceof Error ? error.name : 'UnknownError' });
    return response({ error: 'Unable to load recipes. Please try again.' }, 500);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const access = await manufacturer(request);
  if (access.denied || !access.id) return access.denied ?? response({ error: 'Manufacturer access is required.' }, 403);
  let body: unknown;
  try { body = await request.json(); } catch { return response({ error: 'Enter valid recipe details.' }, 400); }
  const parsed = manufacturingRecipeSchema.safeParse(body);
  if (!parsed.success) return response({ error: parsed.error.issues[0]?.message ?? 'Enter valid recipe details.' }, 400);
  try {
    const result = await createManufacturerRecipe(access.id, parsed.data);
    if (!result.ok && result.code === 'PRODUCT_NOT_FOUND') return response({ error: 'Product not found in your manufacturer account.' }, 404);
    if (!result.ok) return response({ error: 'One or more materials were not found in your account.' }, 404);
    return response({ recipe: result }, 201);
  } catch (error) {
    console.error('[manufacturing:recipes:create]', { requestId: randomUUID(), errorName: error instanceof Error ? error.name : 'UnknownError' });
    return response({ error: 'Unable to save recipe version. Please try again.' }, 500);
  }
}
