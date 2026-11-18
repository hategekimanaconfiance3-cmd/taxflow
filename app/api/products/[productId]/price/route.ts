import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { merchantPriceUpdateSchema } from '@/lib/validation/price-monitoring.schema';
import { updateMerchantSellingPrice } from '@/lib/price-monitoring-service';

export async function PATCH(request: Request, context: { params: Promise<{ productId: string }> }) {
  const requestId = randomUUID();
  const respond = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { 'x-request-id': requestId } });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return respond({ error: 'Sign in to continue.' }, 401);
  if (!['manufacturer', 'wholesaler', 'retailer'].includes(session.user.role ?? '')) {
    return respond({ error: 'Only registered merchants can change selling prices.' }, 403);
  }

  let body: unknown;
  try { body = await request.json(); } catch { return respond({ error: 'Enter valid price details.' }, 400); }
  const parsed = merchantPriceUpdateSchema.safeParse(body);
  if (!parsed.success) return respond({ error: parsed.error.issues[0]?.message ?? 'Enter a valid positive price.' }, 400);

  try {
    const { productId } = await context.params;
    const result = await updateMerchantSellingPrice({
      businessId: session.user.id,
      productId,
      newPrice: parsed.data.price,
      actorName: session.user.name,
      reason: parsed.data.reason,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    return respond({ result, requestId }, result.kind === 'initial' ? 201 : 200);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') console.error(`[price-monitoring:update] requestId=${requestId}`, error);
    return respond({ error: error instanceof Error ? error.message : 'Unable to change the selling price.', requestId }, 400);
  }
}

