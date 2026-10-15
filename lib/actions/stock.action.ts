'use server';

import { eq, and, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import db from '@/db/drizzle';
import { auditLog, product, stock, transaction } from '@/db/schema';
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

  if (!Number.isFinite(data.quantity) || data.quantity <= 0) {
    throw new Error('Quantity must be a positive finite number');
  }

  // Verify the product belongs to this manufacturer.
  const [existingProduct] = await db
    .select({ id: product.id })
    .from(product)
    .where(and(eq(product.id, data.productId), eq(product.createdByUserId, session.user.id)))
    .limit(1);

  if (!existingProduct) {
    throw new Error('Product not found or not owned by you');
  }

  const movementId = randomUUID();

  // Stock increment and its append-only evidence are committed atomically.
  const result = await db.transaction(async (tx) => {
    const [updatedStock] = await tx
      .insert(stock)
      .values({
        businessId: session.user.id,
        productId: data.productId,
        quantity: data.quantity,
        source: 'manufactured',
      })
      .onConflictDoUpdate({
        target: [stock.businessId, stock.productId],
        set: {
          quantity: sql`${stock.quantity} + ${data.quantity}`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: stock.id, quantity: stock.quantity });

    if (!updatedStock) {
      throw new Error('Production stock update could not be confirmed');
    }

    const beforeQuantity = updatedStock.quantity - data.quantity;
    const afterQuantity = updatedStock.quantity;

    await tx.insert(auditLog).values({
      userId: session.user.id,
      action: 'PRODUCTION_RECORDED',
      targetType: 'product',
      targetId: data.productId,
      beforeState: { stockQuantity: beforeQuantity },
      afterState: { stockQuantity: afterQuantity },
      metadata: JSON.stringify({
        movementId,
        movementType: 'production',
        quantity: data.quantity,
        beforeQuantity,
        afterQuantity,
        productId: data.productId,
      }),
    });

    return { stockId: updatedStock.id, beforeQuantity, afterQuantity };
  });

  return { success: true, movementId, ...result };
}

/**
 * Get inventory for a specific business.
 */
export async function getInventory(businessId?: string) {
  const session = await requireTraderSession();
  const targetId = businessId ?? session.user.id;
  if (targetId !== session.user.id) {
    throw new Error('You can only view inventory for your own business.');
  }

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
