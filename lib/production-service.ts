import 'server-only';

import { and, desc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import db from '@/db/drizzle';
import { auditLog, product, productionBatch, stock, stockMovement } from '@/db/schema';
import { getSystemConfig } from '@/lib/actions/system-config.action';
import type { ProductionEntryInput, ProductRegistrationInput } from '@/lib/validation/production.schema';

export interface ProductionHistoryItem {
  id: string;
  productId: string;
  productName: string;
  unit: string;
  batchReference: string;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  vatRate: number;
  potentialTax: number;
  status: string;
  createdAt: string;
}

export async function listManufacturerProducts(manufacturerId: string) {
  return db.select({
    id: product.id,
    name: product.name,
    unit: product.unit,
    categoryCode: product.categoryCode,
  }).from(product)
    .where(eq(product.createdByUserId, manufacturerId))
    .orderBy(product.name);
}

export async function listManufacturerProduction(manufacturerId: string): Promise<ProductionHistoryItem[]> {
  const rows = await db.select({
    id: productionBatch.id,
    productId: productionBatch.productId,
    productName: product.name,
    unit: product.unit,
    batchReference: productionBatch.batchReference,
    quantity: productionBatch.declaredQuantity,
    unitPrice: productionBatch.unitPrice,
    vatRateBasisPoints: productionBatch.vatRateBasisPoints,
    status: productionBatch.status,
    createdAt: productionBatch.createdAt,
  }).from(productionBatch)
    .innerJoin(product, eq(productionBatch.productId, product.id))
    .where(eq(productionBatch.manufacturerId, manufacturerId))
    .orderBy(desc(productionBatch.createdAt))
    .limit(100);

  return rows.map((row) => {
    const totalValue = Math.round(row.quantity * row.unitPrice);
    const vatRate = row.vatRateBasisPoints / 10_000;
    return {
      id: row.id,
      productId: row.productId,
      productName: row.productName,
      unit: row.unit,
      batchReference: row.batchReference,
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      totalValue,
      vatRate,
      potentialTax: Math.round(totalValue * vatRate),
      status: row.status ?? 'recorded',
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export async function registerManufacturerProduct(
  manufacturerId: string,
  input: ProductRegistrationInput,
) {
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(product).values({
      name: input.name,
      unit: input.unit,
      categoryCode: input.categoryCode || null,
      createdByUserId: manufacturerId,
    }).returning({ id: product.id, name: product.name, unit: product.unit, categoryCode: product.categoryCode });

    if (!created) throw new Error('Product registration returned no row');

    await tx.insert(auditLog).values({
      userId: manufacturerId,
      action: 'PRODUCT_REGISTERED',
      targetType: 'product',
      targetId: created.id,
      metadata: JSON.stringify({ productName: created.name, unit: created.unit, categoryCode: created.categoryCode }),
    });

    return created;
  });
}

export async function recordManufacturerProduction(
  manufacturerId: string,
  input: ProductionEntryInput,
) {
  const { vatRate } = await getSystemConfig();
  if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 1) {
    throw new Error('Configured production VAT rate is invalid');
  }
  const vatRateBasisPoints = Math.round(vatRate * 10_000);
  const totalValue = Math.round(input.quantity * input.unitPrice);
  const potentialTax = Math.round(totalValue * vatRate);
  const now = new Date();
  const batchReference = `TF-BATCH-${now.toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;

  return db.transaction(async (tx) => {
    const [ownedProduct] = await tx.select({ id: product.id, name: product.name, unit: product.unit })
      .from(product)
      .where(and(eq(product.id, input.productId), eq(product.createdByUserId, manufacturerId)))
      .for('update')
      .limit(1);

    if (!ownedProduct) return { ok: false as const, code: 'PRODUCT_NOT_FOUND' as const };

    const [batch] = await tx.insert(productionBatch).values({
      manufacturerId,
      productId: input.productId,
      batchReference,
      declaredQuantity: input.quantity,
      unitPrice: input.unitPrice,
      vatRateBasisPoints,
      idempotencyKey: input.idempotencyKey,
      status: 'recorded',
      periodStart: now,
      periodEnd: now,
      notes: null,
    }).onConflictDoNothing({ target: productionBatch.idempotencyKey }).returning({
      id: productionBatch.id,
      batchReference: productionBatch.batchReference,
    });

    if (!batch) {
      const [existing] = await tx.select({
        id: productionBatch.id,
        batchReference: productionBatch.batchReference,
        productId: productionBatch.productId,
        quantity: productionBatch.declaredQuantity,
        unitPrice: productionBatch.unitPrice,
        vatRateBasisPoints: productionBatch.vatRateBasisPoints,
      }).from(productionBatch)
        .where(and(
          eq(productionBatch.manufacturerId, manufacturerId),
          eq(productionBatch.idempotencyKey, input.idempotencyKey),
        )).limit(1);

      if (!existing || existing.productId !== input.productId || existing.quantity !== input.quantity || existing.unitPrice !== input.unitPrice) {
        return { ok: false as const, code: 'DUPLICATE_REQUEST' as const };
      }

      return {
        ok: true as const,
        replayed: true,
        record: {
          id: existing.id,
          productId: existing.productId,
          productName: ownedProduct.name,
          unit: ownedProduct.unit,
          batchReference: existing.batchReference,
          quantity: existing.quantity,
          unitPrice: existing.unitPrice,
          totalValue: Math.round(existing.quantity * existing.unitPrice),
          vatRate: existing.vatRateBasisPoints / 10_000,
          potentialTax: Math.round(Math.round(existing.quantity * existing.unitPrice) * (existing.vatRateBasisPoints / 10_000)),
          status: 'recorded',
          createdAt: now.toISOString(),
        },
      };
    }

    const [updatedStock] = await tx.insert(stock).values({
      businessId: manufacturerId,
      productId: input.productId,
      quantity: input.quantity,
      source: 'manufactured',
      price: input.unitPrice,
    }).onConflictDoUpdate({
      target: [stock.businessId, stock.productId],
      set: {
        quantity: sql`${stock.quantity} + ${input.quantity}`,
        price: input.unitPrice,
        source: 'manufactured',
        updatedAt: now,
      },
    }).returning({ id: stock.id, quantity: stock.quantity });

    if (!updatedStock) throw new Error('Inventory update returned no row');

    const quantityBefore = updatedStock.quantity - input.quantity;
    const quantityAfter = updatedStock.quantity;
    await tx.insert(stockMovement).values({
      businessId: manufacturerId,
      productId: input.productId,
      quantityDelta: input.quantity,
      quantityBefore,
      quantityAfter,
      movementType: 'production',
      sourceType: 'production_batch',
      sourceId: batch.id,
      actorUserId: manufacturerId,
      reason: 'Manufacturer production recorded',
    });

    const auditEvents = ['PRODUCTION_CREATED', 'BATCH_CREATED', 'INVENTORY_INCREASED'] as const;
    await tx.insert(auditLog).values(auditEvents.map((action) => ({
      userId: manufacturerId,
      action,
      targetType: 'production_batch',
      targetId: batch.id,
      beforeState: { stockQuantity: quantityBefore },
      afterState: { stockQuantity: quantityAfter },
      metadata: JSON.stringify({
        productId: input.productId,
        batchId: batch.id,
        batchReference: batch.batchReference,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        totalValue,
        vatRateBasisPoints,
        potentialTax,
        source: action === 'INVENTORY_INCREASED' ? 'PRODUCTION' : undefined,
      }),
    })));

    return {
      ok: true as const,
      replayed: false,
      record: {
        id: batch.id,
        productId: input.productId,
        productName: ownedProduct.name,
        unit: ownedProduct.unit,
        batchReference: batch.batchReference,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        totalValue,
        vatRate,
        potentialTax,
        status: 'recorded',
        createdAt: now.toISOString(),
      },
    };
  });
}
