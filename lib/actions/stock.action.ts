'use server';

import { eq, and, sql } from 'drizzle-orm';
import db from '@/db/drizzle';
import { product, stock, transaction } from '@/db/schema';
import { requireTraderSession } from '@/lib/auth-guard';
import { logAudit } from '@/lib/audit';

// ---------------------------------------------------------------------------
// Product CRUD (manufacturer only)
// ---------------------------------------------------------------------------

export async function createProduct(data: { name: string; unit: string; categoryCode?: string }) {
  const session = await requireTraderSession(['manufacturer']);

  const [newProduct] = await db
    .insert(product)
    .values({
      name: data.name,
      unit: data.unit,
      categoryCode: data.categoryCode ?? null,
      createdByUserId: session.user.id,
    })
    .returning();

  await logAudit({
    userId: session.user.id,
    action: 'PRODUCT_CREATED',
    targetType: 'product',
    targetId: newProduct.id,
    metadata: { name: data.name, unit: data.unit },
  });

  return newProduct;
}

export async function getProducts(userId?: string) {
  const session = await requireTraderSession();

  if (userId) {
    return db.select().from(product).where(eq(product.createdByUserId, userId));
  }

  // Return all products (any trader can see them for purchasing)
  return db.select().from(product);
}

// ---------------------------------------------------------------------------
// Stock management
// ---------------------------------------------------------------------------

/**
 * Record new production (manufacturer only).
 * Creates or updates the stock row for (manufacturer, product).
 */
export async function recordProduction(data: { productId: string; quantity: number }) {
  const session = await requireTraderSession(['manufacturer']);

  if (data.quantity <= 0) {
    throw new Error('Quantity must be positive');
  }

  // Verify the product belongs to this manufacturer
  const [existingProduct] = await db
    .select()
    .from(product)
    .where(and(eq(product.id, data.productId), eq(product.createdByUserId, session.user.id)))
    .limit(1);

  if (!existingProduct) {
    throw new Error('Product not found or not owned by you');
  }

  // Upsert stock: insert or increment
  const [existingStock] = await db
    .select()
    .from(stock)
    .where(and(eq(stock.businessId, session.user.id), eq(stock.productId, data.productId)))
    .limit(1);

  if (existingStock) {
    await db
      .update(stock)
      .set({ quantity: existingStock.quantity + data.quantity })
      .where(eq(stock.id, existingStock.id));
  } else {
    await db.insert(stock).values({
      businessId: session.user.id,
      productId: data.productId,
      quantity: data.quantity,
    });
  }

  await logAudit({
    userId: session.user.id,
    action: 'PRODUCTION_RECORDED',
    targetType: 'product',
    targetId: data.productId,
    metadata: { quantity: data.quantity },
  });

  return { success: true };
}

/**
 * Get inventory for a specific business.
 */
export async function getInventory(businessId?: string) {
  const session = await requireTraderSession();
  const targetId = businessId ?? session.user.id;

  return db
    .select({
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
    })
    .from(stock)
    .innerJoin(product, eq(stock.productId, product.id))
    .where(eq(stock.businessId, targetId));
}
