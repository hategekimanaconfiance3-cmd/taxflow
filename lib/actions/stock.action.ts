'use server';

import { eq, sql } from 'drizzle-orm';
import db from '@/db/drizzle';
import { product, stock, transaction } from '@/db/schema';
import { requireTraderSession } from '@/lib/auth-guard';

/** Read products visible to a signed-in trader; an explicit user id is self-only. */
export async function getProducts(userId?: string) {
  const session = await requireTraderSession();
  if (userId && userId !== session.user.id) {
    throw new Error('You can only view products registered to your business.');
  }

  if (userId) {
    return db.select().from(product).where(eq(product.createdByUserId, session.user.id));
  }
  return db.select().from(product);
}

/** Read the signed-in trader's inventory. */
export async function getInventory(businessId?: string) {
  const session = await requireTraderSession();
  const targetId = businessId ?? session.user.id;
  if (targetId !== session.user.id) {
    throw new Error('You can only view inventory for your own business.');
  }

  return db.select({
    id: stock.id,
    productId: stock.productId,
    productName: product.name,
    productUnit: product.unit,
    quantity: stock.quantity,
    unitPrice: stock.price,
    updatedAt: stock.updatedAt,
    latestUnitPrice: sql<number | null>`(
      SELECT ${transaction.unitPrice}
      FROM ${transaction}
      WHERE ${transaction.productId} = ${stock.productId}
        AND (${transaction.sellerId} = ${stock.businessId} OR ${transaction.buyerId} = ${stock.businessId})
        AND ${transaction.status} IN ('confirmed', 'completed')
      ORDER BY ${transaction.createdAt} DESC
      LIMIT 1
    )`.as('latest_unit_price'),
  }).from(stock)
    .innerJoin(product, eq(stock.productId, product.id))
    .where(eq(stock.businessId, targetId));
}
