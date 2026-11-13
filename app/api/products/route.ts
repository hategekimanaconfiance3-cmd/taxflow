import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { registerManufacturerProduct } from '@/lib/production-service';
import { productRegistrationSchema } from '@/lib/validation/production.schema';

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();
  const respond = (body: unknown, status: number) => NextResponse.json(body, {
    status,
    headers: { 'x-request-id': requestId },
  });

  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return respond({ error: 'Sign in to continue.' }, 401);
    if (session.user.role !== 'manufacturer') {
      return respond({ error: 'Production access restricted. Only authorized manufacturers can register products.' }, 403);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return respond({ error: 'Enter valid product details.' }, 400);
    }

    const parsed = productRegistrationSchema.safeParse(body);
    if (!parsed.success) {
      return respond({ error: parsed.error.issues[0]?.message ?? 'Enter valid product details.' }, 400);
    }

    const product = await registerManufacturerProduct(session.user.id, parsed.data);
    return respond({ product }, 201);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[production:register-product] requestId=${requestId}`, error);
    } else {
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      console.error('[production:register-product]', { requestId, errorName });
    }
    return respond({ error: 'Unable to register this product. Please try again.', requestId }, 500);
  }
}
