import 'server-only';

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import db from '@/db/drizzle';
import {
  auditLog,
  b2bOrderAcceptance,
  importDeclaration,
  productionBatch,
  productionBatchMaterialUsage,
  productionMaterial,
  productionMaterialMovement,
  productionMaterialPlan,
  productionMaterialPlanLine,
  productionMaterialReceipt,
  productionHistoryComparison,
  productionRecipe,
  productionRecipeMaterial,
  product,
  rraStaff,
  rraStaffRole,
  stock,
  stockMovement,
  transaction,
  user,
} from '@/db/schema';
import { createNotification } from '@/lib/notifications';
import {
  decimalToMicros,
  microsToDecimal,
  multiplyQuantities,
  normalizeMaterialUnit,
  quantityToMicros,
} from '@/lib/material-accounting';
import type {
  productionBatchMaterialReviewSchema,
  productionMaterialAdjustmentSchema,
  productionMaterialPlanSchema,
  productionMaterialReceiptReviewSchema,
  productionMaterialReceiptSchema,
} from '@/lib/validation/production.schema';
import type { z } from 'zod';
import { z as zod } from 'zod';

type PlanInput = z.infer<typeof productionMaterialPlanSchema>;
type ReceiptInput = z.infer<typeof productionMaterialReceiptSchema>;
type ReceiptReviewInput = z.infer<typeof productionMaterialReceiptReviewSchema>;
type BatchReviewInput = z.infer<typeof productionBatchMaterialReviewSchema>;
type AdjustmentInput = z.infer<typeof productionMaterialAdjustmentSchema>;

const storedComparisonSchema = zod.object({
  comparisonAt: zod.string(),
  ruleVersion: zod.string(),
  alertReasons: zod.array(zod.string()),
  limitations: zod.array(zod.string()),
  previousDeclarations: zod.array(zod.object({
    batchReference: zod.string(),
    plannedOutputQuantity: zod.number().nullable(),
    declaredOutputQuantity: zod.number(),
    periodEnd: zod.string(),
    materials: zod.array(zod.object({
      materialCode: zod.string(),
      unit: zod.string(),
      plannedQuantity: zod.number(),
      actualQuantity: zod.number(),
    }).passthrough()),
  }).passthrough()),
  materials: zod.array(zod.object({
    materialCode: zod.string(),
    unit: zod.string(),
    plannedQuantity: zod.number(),
    actualQuantity: zod.number(),
    consumptionToleranceBasisPoints: zod.number().nullable(),
    verifiedAvailableQuantity: zod.string(),
    shortageQuantity: zod.string(),
  }).passthrough()),
  metrics: zod.array(zod.object({
    code: zod.string(),
    signal: zod.string(),
    expectedRatio: zod.number().nullable(),
    observedRatio: zod.number().nullable(),
    deviationPercent: zod.number().nullable(),
    thresholdPercent: zod.number(),
    baselineBatchCount: zod.number(),
    confidence: zod.string(),
  }).passthrough()),
}).passthrough();

export class MaterialAccountingError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'MaterialAccountingError';
  }
}

type SelectDatabase = Pick<typeof db, 'select'>;

async function getMaterialBalance(tx: SelectDatabase, manufacturerId: string, materialId: string): Promise<bigint> {
  const [row] = await tx.select({ balance: sql<string>`COALESCE(SUM(${productionMaterialMovement.quantityDelta}), 0)::text` })
    .from(productionMaterialMovement)
    .where(and(
      eq(productionMaterialMovement.manufacturerId, manufacturerId),
      eq(productionMaterialMovement.materialId, materialId),
    ));
  return decimalToMicros(row?.balance ?? '0');
}

export async function notifyRraReviewers(
  roles: readonly ('customs_import_officer' | 'stock_control_admin')[],
  title: string,
  message: string,
  link: string,
): Promise<void> {
  const rows = await db.selectDistinct({ userId: rraStaff.userId })
    .from(rraStaffRole)
    .innerJoin(rraStaff, eq(rraStaffRole.staffRecordId, rraStaff.id))
    .innerJoin(user, eq(rraStaff.userId, user.id))
    .where(and(inArray(rraStaffRole.role, [...roles]), eq(rraStaff.isActive, true), eq(user.isActive, true)));
  for (const row of rows) {
    await createNotification({ userId: row.userId, type: 'system', title, message, link });
  }
}

export async function notifyProductionBatchSubmitted(batchId: string): Promise<void> {
  const [batch] = await db.select({
    manufacturerId: productionBatch.manufacturerId,
    batchReference: productionBatch.batchReference,
  }).from(productionBatch).where(eq(productionBatch.id, batchId)).limit(1);
  if (!batch) return;

  const usages = await db.select({
    materialId: productionBatchMaterialUsage.materialId,
    materialCode: productionMaterial.materialCode,
    unit: productionMaterial.unit,
    actualQuantity: productionBatchMaterialUsage.actualQuantity,
  }).from(productionBatchMaterialUsage)
    .innerJoin(productionMaterial, eq(productionBatchMaterialUsage.materialId, productionMaterial.id))
    .where(eq(productionBatchMaterialUsage.productionBatchId, batchId));
  const balanceRows = usages.length ? await db.select({
    materialId: productionMaterialMovement.materialId,
    balance: sql<string>`COALESCE(SUM(${productionMaterialMovement.quantityDelta}), 0)::text`,
  }).from(productionMaterialMovement)
    .where(inArray(productionMaterialMovement.materialId, [...new Set(usages.map((usage) => usage.materialId))]))
    .groupBy(productionMaterialMovement.materialId) : [];
  const balances = new Map(balanceRows.map((row) => [row.materialId, decimalToMicros(row.balance)]));
  const shortageCodes = usages.filter((usage) => (balances.get(usage.materialId) ?? BigInt(0)) < quantityToMicros(usage.actualQuantity))
    .map((usage) => usage.materialCode);
  const manufacturerMessage = shortageCodes.length
    ? `Batch ${batch.batchReference} is held for review. Verified material stock is short for: ${shortageCodes.join(', ')}. No material was deducted and no finished goods were added to available stock.`
    : `Batch ${batch.batchReference} is held for independent review. No material was deducted and no finished goods were added to available stock.`;

  await notifySafely({
    userId: batch.manufacturerId,
    type: 'system',
    title: shortageCodes.length ? 'Production material shortage' : 'Production batch awaiting review',
    message: manufacturerMessage,
    link: '/dashboard/production',
  });
  try {
    await notifyRraReviewers(
      ['stock_control_admin'],
      shortageCodes.length ? 'Production material shortage needs review' : 'Production batch needs review',
      `Batch ${batch.batchReference} is held for material review. ${shortageCodes.length} material line(s) currently show insufficient verified stock. Review protected material codes and evidence in the batch queue.`,
      '/admin/production/material-accounting',
    );
  } catch (error) {
    console.error('[material-accounting:batch-review-notification]', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
  }
}

async function notifySafely(input: { userId: string; type: string; title: string; message: string; link: string }): Promise<void> {
  try {
    await createNotification(input);
  } catch (error) {
    console.error('[material-accounting:notification]', {
      userId: input.userId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
  }
}

export async function listManufacturerMaterialAccounting(manufacturerId: string) {
  const materials = await db.select({
    id: productionMaterial.id,
    materialCode: productionMaterial.materialCode,
    name: productionMaterial.confidentialName,
    unit: productionMaterial.unit,
  }).from(productionMaterial)
    .where(eq(productionMaterial.manufacturerId, manufacturerId))
    .orderBy(productionMaterial.materialCode);

  const balanceRows = await db.select({
    materialId: productionMaterialMovement.materialId,
    balance: sql<string>`COALESCE(SUM(${productionMaterialMovement.quantityDelta}), 0)::text`,
  }).from(productionMaterialMovement)
    .where(eq(productionMaterialMovement.manufacturerId, manufacturerId))
    .groupBy(productionMaterialMovement.materialId);
  const balances = new Map(balanceRows.map((row) => [row.materialId, row.balance]));

  const receipts = await db.select({
    id: productionMaterialReceipt.id,
    materialId: productionMaterialReceipt.materialId,
    materialCode: productionMaterial.materialCode,
    origin: productionMaterialReceipt.origin,
    sourceReference: sql<string>`COALESCE(${productionMaterialReceipt.importDeclarationId}, ${productionMaterialReceipt.transactionId}, ${productionMaterialReceipt.supplierReference}, ${productionMaterialReceipt.evidenceReference})`,
    evidenceReference: productionMaterialReceipt.evidenceReference,
    quantity: productionMaterialReceipt.quantity,
    unit: productionMaterialReceipt.unit,
    status: productionMaterialReceipt.status,
    reviewNote: productionMaterialReceipt.reviewNote,
    createdAt: productionMaterialReceipt.createdAt,
  }).from(productionMaterialReceipt)
    .innerJoin(productionMaterial, eq(productionMaterialReceipt.materialId, productionMaterial.id))
    .where(eq(productionMaterialReceipt.manufacturerId, manufacturerId))
    .orderBy(desc(productionMaterialReceipt.createdAt))
    .limit(100);

  const eligibleImports = await db.select({
    id: importDeclaration.id,
    materialId: importDeclaration.productionMaterialId,
    materialCode: productionMaterial.materialCode,
    customsReference: importDeclaration.customsRef,
    inspectedQuantity: importDeclaration.inspectedQuantity,
    unit: productionMaterial.unit,
  }).from(importDeclaration)
    .innerJoin(productionMaterial, eq(importDeclaration.productionMaterialId, productionMaterial.id))
    .leftJoin(productionMaterialReceipt, eq(productionMaterialReceipt.importDeclarationId, importDeclaration.id))
    .where(and(
      eq(importDeclaration.businessId, manufacturerId),
      eq(importDeclaration.status, 'activated'),
      isNull(productionMaterialReceipt.id),
      sql`${importDeclaration.inspectedQuantity} IS NOT NULL`,
    ))
    .orderBy(desc(importDeclaration.createdAt))
    .limit(100);

  return {
    materials: materials.map((material) => ({ ...material, balance: balances.get(material.id) ?? '0' })),
    receipts,
    eligibleImports,
  };
}

export async function listManufacturerMaterialPlans(manufacturerId: string) {
  return db.select({
    id: productionMaterialPlan.id,
    productId: productionMaterialPlan.productId,
    productName: product.name,
    recipeVersionId: productionMaterialPlan.recipeVersionId,
    recipeVersion: productionRecipe.version,
    plannedOutputQuantity: productionMaterialPlan.plannedOutputQuantity,
    status: productionMaterialPlan.status,
    createdAt: productionMaterialPlan.createdAt,
  }).from(productionMaterialPlan)
    .innerJoin(product, eq(productionMaterialPlan.productId, product.id))
    .innerJoin(productionRecipe, eq(productionMaterialPlan.recipeVersionId, productionRecipe.id))
    .where(eq(productionMaterialPlan.manufacturerId, manufacturerId))
    .orderBy(desc(productionMaterialPlan.createdAt))
    .limit(100);
}

export async function createManufacturerMaterialPlan(manufacturerId: string, input: PlanInput) {
  const outputMicros = quantityToMicros(input.plannedOutputQuantity);
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(productionMaterialPlan)
      .where(and(eq(productionMaterialPlan.manufacturerId, manufacturerId), eq(productionMaterialPlan.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    if (existing) {
      if (existing.productId !== input.productId || existing.recipeVersionId !== input.recipeVersionId
        || decimalToMicros(existing.plannedOutputQuantity) !== outputMicros) {
        throw new MaterialAccountingError('DUPLICATE_REQUEST', 'This plan key was already used for different details.');
      }
      return { id: existing.id, replayed: true };
    }

    const [ownedProduct] = await tx.select({ id: product.id }).from(product)
      .where(and(eq(product.id, input.productId), eq(product.createdByUserId, manufacturerId)))
      .for('update').limit(1);
    const [recipe] = await tx.select({ id: productionRecipe.id, outputQuantity: productionRecipe.outputQuantity })
      .from(productionRecipe)
      .where(and(eq(productionRecipe.id, input.recipeVersionId), eq(productionRecipe.manufacturerId, manufacturerId), eq(productionRecipe.productId, input.productId)))
      .for('update').limit(1);
    if (!ownedProduct || !recipe) throw new MaterialAccountingError('RECIPE_NOT_FOUND', 'Select a recipe for a product registered to your business.');

    const recipeLines = await tx.select({
      recipeMaterialId: productionRecipeMaterial.id,
      materialId: productionRecipeMaterial.materialId,
      quantity: productionRecipeMaterial.quantity,
      materialUnit: productionMaterial.unit,
      materialManufacturerId: productionMaterial.manufacturerId,
    }).from(productionRecipeMaterial)
      .innerJoin(productionMaterial, eq(productionRecipeMaterial.materialId, productionMaterial.id))
      .where(eq(productionRecipeMaterial.recipeVersionId, recipe.id));
    if (recipeLines.length === 0 || recipeLines.some((line) => line.materialManufacturerId !== manufacturerId)) {
      throw new MaterialAccountingError('RECIPE_INVALID', 'This recipe does not have valid business-owned material lines.');
    }

    const planId = crypto.randomUUID();
    const [plan] = await tx.insert(productionMaterialPlan).values({
      id: planId,
      manufacturerId,
      productId: input.productId,
      recipeVersionId: input.recipeVersionId,
      plannedOutputQuantity: microsToDecimal(outputMicros),
      idempotencyKey: input.idempotencyKey,
      createdByUserId: manufacturerId,
    }).returning({ id: productionMaterialPlan.id });
    if (!plan) throw new Error('Production plan was not created.');

    const recipeOutputMicros = quantityToMicros(recipe.outputQuantity);
    const lines = recipeLines.map((line) => ({
      planId,
      recipeMaterialId: line.recipeMaterialId,
      materialId: line.materialId,
      plannedQuantity: microsToDecimal(multiplyQuantities(outputMicros, quantityToMicros(line.quantity), recipeOutputMicros)),
    }));
    await tx.insert(productionMaterialPlanLine).values(lines);
    await tx.insert(auditLog).values({
      userId: manufacturerId,
      action: 'PRODUCTION_MATERIAL_PLAN_CREATED',
      targetType: 'production_material_plan',
      targetId: planId,
      metadata: JSON.stringify({ productId: input.productId, recipeVersionId: input.recipeVersionId, materialLineCount: lines.length, plannedOutputQuantity: microsToDecimal(outputMicros) }),
    });
    return { id: planId, replayed: false };
  });
}

export async function submitProductionMaterialReceipt(manufacturerId: string, input: ReceiptInput) {
  const quantity = microsToDecimal(quantityToMicros(input.quantity));
  const result = await db.transaction(async (tx) => {
    const [material] = await tx.select({ id: productionMaterial.id, unit: productionMaterial.unit })
      .from(productionMaterial)
      .where(and(eq(productionMaterial.id, input.materialId), eq(productionMaterial.manufacturerId, manufacturerId)))
      .for('update').limit(1);
    if (!material) throw new MaterialAccountingError('MATERIAL_NOT_FOUND', 'Material not found for your business.');
    const [existing] = await tx.select().from(productionMaterialReceipt)
      .where(and(eq(productionMaterialReceipt.manufacturerId, manufacturerId), eq(productionMaterialReceipt.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    if (existing) {
      if (existing.materialId !== input.materialId || existing.origin !== input.origin || existing.quantity !== quantity
        || existing.importDeclarationId !== (input.importDeclarationId ?? null) || existing.transactionId !== (input.transactionId ?? null)) {
        throw new MaterialAccountingError('DUPLICATE_REQUEST', 'This request key was already used for different receipt details.');
      }
      return { receiptId: existing.id, replayed: true };
    }

    if (input.origin === 'import') {
      const [declaration] = await tx.select({
        id: importDeclaration.id,
        inspectedQuantity: importDeclaration.inspectedQuantity,
        status: importDeclaration.status,
        businessId: importDeclaration.businessId,
        productionMaterialId: importDeclaration.productionMaterialId,
        productUnit: product.unit,
      })
        .from(importDeclaration)
        .innerJoin(product, eq(importDeclaration.productId, product.id))
        .where(eq(importDeclaration.id, input.importDeclarationId ?? ''))
        .for('update').limit(1);
      if (!declaration || declaration.businessId !== manufacturerId || declaration.status !== 'activated'
        || declaration.inspectedQuantity == null || declaration.productionMaterialId !== material.id) {
        throw new MaterialAccountingError('IMPORT_NOT_VERIFIED', 'Link only an activated import with recorded RRA inspection evidence.');
      }
      if (normalizeMaterialUnit(declaration.productUnit) !== normalizeMaterialUnit(material.unit)) {
        throw new MaterialAccountingError('UNIT_MISMATCH', 'Import product unit must exactly match the selected material unit.');
      }
      const [claimed] = await tx.select({ quantity: sql<string>`COALESCE(SUM(${productionMaterialReceipt.quantity}), 0)::text` })
        .from(productionMaterialReceipt)
        .where(and(eq(productionMaterialReceipt.importDeclarationId, declaration.id), inArray(productionMaterialReceipt.status, ['pending', 'verified'])));
      if (decimalToMicros(claimed?.quantity ?? '0') + quantityToMicros(input.quantity) > quantityToMicros(declaration.inspectedQuantity)) {
        throw new MaterialAccountingError('SOURCE_QUANTITY_EXCEEDED', 'The claimed material quantity exceeds the inspected import quantity remaining.');
      }
    }

    if (input.origin === 'domestic') {
      const [sale] = await tx.select({
        id: transaction.id,
        buyerId: transaction.buyerId,
        status: transaction.status,
        quantity: transaction.quantity,
        productUnit: product.unit,
      }).from(transaction)
        .innerJoin(product, eq(transaction.productId, product.id))
        .where(eq(transaction.id, input.transactionId ?? ''))
        .for('update').limit(1);
      const [acceptance] = sale ? await tx.select({ id: b2bOrderAcceptance.id }).from(b2bOrderAcceptance)
        .where(and(eq(b2bOrderAcceptance.transactionId, sale.id), eq(b2bOrderAcceptance.buyerBusinessId, manufacturerId)))
        .limit(1) : [];
      if (!sale || sale.buyerId !== manufacturerId || sale.status !== 'confirmed' || !acceptance) {
        throw new MaterialAccountingError('TRANSACTION_NOT_CONFIRMED', 'Domestic material receipts require an incoming sale confirmed by your business.');
      }
      if (normalizeMaterialUnit(sale.productUnit) !== normalizeMaterialUnit(material.unit)) {
        throw new MaterialAccountingError('UNIT_MISMATCH', 'Transaction product unit must match the selected material unit.');
      }
      const [claimed] = await tx.select({ quantity: sql<string>`COALESCE(SUM(${productionMaterialReceipt.quantity}), 0)::text` })
        .from(productionMaterialReceipt)
        .where(and(eq(productionMaterialReceipt.transactionId, sale.id), inArray(productionMaterialReceipt.status, ['pending', 'verified'])));
      if (decimalToMicros(claimed?.quantity ?? '0') + quantityToMicros(input.quantity) > quantityToMicros(sale.quantity)) {
        throw new MaterialAccountingError('SOURCE_QUANTITY_EXCEEDED', 'The claimed receipt quantity exceeds the confirmed transaction quantity remaining.');
      }
    }

    if (input.origin === 'opening_balance') {
      const [existingOpening] = await tx.select({ id: productionMaterialReceipt.id }).from(productionMaterialReceipt)
        .where(and(eq(productionMaterialReceipt.materialId, material.id), eq(productionMaterialReceipt.origin, 'opening_balance'), inArray(productionMaterialReceipt.status, ['pending', 'verified'])))
        .limit(1);
      if (existingOpening) throw new MaterialAccountingError('OPENING_BALANCE_EXISTS', 'A verified or pending opening-balance claim already exists for this material. Use a documented adjustment for corrections.');
    }

    const [receipt] = await tx.insert(productionMaterialReceipt).values({
      manufacturerId,
      materialId: input.materialId,
      origin: input.origin,
      importDeclarationId: input.importDeclarationId ?? null,
      transactionId: input.transactionId ?? null,
      supplierReference: input.supplierReference || null,
      evidenceReference: input.evidenceReference,
      unit: material.unit,
      quantity,
      idempotencyKey: input.idempotencyKey,
      submittedByUserId: manufacturerId,
    }).returning({ id: productionMaterialReceipt.id });
    if (!receipt) throw new Error('Material receipt request was not created.');

    await tx.insert(auditLog).values({
      userId: manufacturerId,
      action: 'PRODUCTION_MATERIAL_RECEIPT_SUBMITTED',
      targetType: 'production_material_receipt',
      targetId: receipt.id,
      metadata: JSON.stringify({ materialId: input.materialId, origin: input.origin, importDeclarationId: input.importDeclarationId ?? null, transactionId: input.transactionId ?? null, quantity, unit: material.unit, evidenceReference: input.evidenceReference }),
    });
    return { receiptId: receipt.id, replayed: false };
  });

  if (!result.replayed) {
    try {
      await notifyRraReviewers(input.origin === 'import' ? ['customs_import_officer', 'stock_control_admin'] : ['stock_control_admin'], 'Material receipt needs review', 'A confidential material receipt is awaiting verification. Review the source evidence and protected material code.', '/admin/production/material-accounting');
    } catch (error) {
      console.error('[material-accounting:reviewer-notification]', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    }
    await notifySafely({ userId: manufacturerId, type: 'system', title: 'Material receipt submitted', message: 'The receipt is pending verification and is not yet available in material stock.', link: '/dashboard/production' });
  }
  return result;
}

export async function listPendingProductionMaterialReceipts() {
  return db.select({
    id: productionMaterialReceipt.id,
    manufacturerId: productionMaterialReceipt.manufacturerId,
    manufacturerName: user.businessName,
    materialCode: productionMaterial.materialCode,
    origin: productionMaterialReceipt.origin,
    importDeclarationId: productionMaterialReceipt.importDeclarationId,
    transactionId: productionMaterialReceipt.transactionId,
    supplierReference: productionMaterialReceipt.supplierReference,
    evidenceReference: productionMaterialReceipt.evidenceReference,
    quantity: productionMaterialReceipt.quantity,
    unit: productionMaterialReceipt.unit,
    submittedAt: productionMaterialReceipt.createdAt,
  }).from(productionMaterialReceipt)
    .innerJoin(productionMaterial, eq(productionMaterialReceipt.materialId, productionMaterial.id))
    .innerJoin(user, eq(productionMaterialReceipt.manufacturerId, user.id))
    .where(eq(productionMaterialReceipt.status, 'pending'))
    .orderBy(productionMaterialReceipt.createdAt)
    .limit(250);
}

async function validateReceiptSource(tx: SelectDatabase, receipt: typeof productionMaterialReceipt.$inferSelect): Promise<void> {
  if (receipt.origin === 'import') {
    const [declaration] = await tx.select({
      id: importDeclaration.id,
      businessId: importDeclaration.businessId,
      status: importDeclaration.status,
      inspectedQuantity: importDeclaration.inspectedQuantity,
      productionMaterialId: importDeclaration.productionMaterialId,
      productUnit: product.unit,
    })
      .from(importDeclaration)
      .innerJoin(product, eq(importDeclaration.productId, product.id))
      .where(eq(importDeclaration.id, receipt.importDeclarationId ?? '')).for('update').limit(1);
    if (!declaration || declaration.businessId !== receipt.manufacturerId || declaration.status !== 'activated'
      || declaration.inspectedQuantity == null || declaration.productionMaterialId !== receipt.materialId) {
      throw new MaterialAccountingError('IMPORT_NOT_VERIFIED', 'The linked import is no longer supported by verified inspection evidence.');
    }
    if (normalizeMaterialUnit(declaration.productUnit) !== normalizeMaterialUnit(receipt.unit)) {
      throw new MaterialAccountingError('UNIT_MISMATCH', 'Import product unit does not match the recorded material receipt unit.');
    }
    const [claimed] = await tx.select({ quantity: sql<string>`COALESCE(SUM(${productionMaterialReceipt.quantity}), 0)::text` })
      .from(productionMaterialReceipt)
      .where(and(eq(productionMaterialReceipt.importDeclarationId, declaration.id), inArray(productionMaterialReceipt.status, ['pending', 'verified'])));
    if (decimalToMicros(claimed?.quantity ?? '0') > quantityToMicros(declaration.inspectedQuantity)) {
      throw new MaterialAccountingError('SOURCE_QUANTITY_EXCEEDED', 'Import receipt claims exceed the inspected quantity.');
    }
  }
  if (receipt.origin === 'domestic') {
    const [sale] = await tx.select({ id: transaction.id, buyerId: transaction.buyerId, status: transaction.status, quantity: transaction.quantity, productUnit: product.unit })
      .from(transaction).innerJoin(product, eq(transaction.productId, product.id))
      .where(eq(transaction.id, receipt.transactionId ?? '')).for('update').limit(1);
    const [acceptance] = sale ? await tx.select({ id: b2bOrderAcceptance.id }).from(b2bOrderAcceptance)
      .where(and(eq(b2bOrderAcceptance.transactionId, sale.id), eq(b2bOrderAcceptance.buyerBusinessId, receipt.manufacturerId))).limit(1) : [];
    if (!sale || sale.buyerId !== receipt.manufacturerId || sale.status !== 'confirmed' || !acceptance || normalizeMaterialUnit(sale.productUnit) !== normalizeMaterialUnit(receipt.unit)) {
      throw new MaterialAccountingError('TRANSACTION_NOT_CONFIRMED', 'The linked domestic transaction does not establish a confirmed matching receipt.');
    }
    const [claimed] = await tx.select({ quantity: sql<string>`COALESCE(SUM(${productionMaterialReceipt.quantity}), 0)::text` })
      .from(productionMaterialReceipt)
      .where(and(eq(productionMaterialReceipt.transactionId, sale.id), inArray(productionMaterialReceipt.status, ['pending', 'verified'])));
    if (decimalToMicros(claimed?.quantity ?? '0') > quantityToMicros(sale.quantity)) {
      throw new MaterialAccountingError('SOURCE_QUANTITY_EXCEEDED', 'Domestic receipt claims exceed the confirmed transaction quantity.');
    }
  }
}

export async function reviewProductionMaterialReceipt(actorUserId: string, input: ReceiptReviewInput) {
  const result = await db.transaction(async (tx) => {
    const [receipt] = await tx.select().from(productionMaterialReceipt)
      .where(eq(productionMaterialReceipt.id, input.receiptId)).for('update').limit(1);
    if (!receipt) throw new MaterialAccountingError('NOT_FOUND', 'Material receipt was not found.');
    if (receipt.status !== 'pending') return { receiptId: receipt.id, status: receipt.status, replayed: true, manufacturerId: receipt.manufacturerId };

    const [material] = await tx.select({ id: productionMaterial.id, materialCode: productionMaterial.materialCode, manufacturerId: productionMaterial.manufacturerId })
      .from(productionMaterial).where(eq(productionMaterial.id, receipt.materialId)).for('update').limit(1);
    if (!material || material.manufacturerId !== receipt.manufacturerId) throw new MaterialAccountingError('MATERIAL_NOT_FOUND', 'The confidential material owner does not match the receipt.');
    if (input.decision === 'verify') await validateReceiptSource(tx, receipt);

    if (input.decision === 'verify') {
      const before = await getMaterialBalance(tx, receipt.manufacturerId, receipt.materialId);
      const delta = decimalToMicros(receipt.quantity);
      const after = before + delta;
      await tx.insert(productionMaterialMovement).values({
        manufacturerId: receipt.manufacturerId,
        materialId: receipt.materialId,
        movementType: 'receipt',
        quantityDelta: microsToDecimal(delta),
        quantityBefore: microsToDecimal(before),
        quantityAfter: microsToDecimal(after),
        receiptId: receipt.id,
        sourceReference: receipt.importDeclarationId ?? receipt.transactionId ?? receipt.evidenceReference,
        actorUserId,
        reason: `Verified ${receipt.origin} material receipt`,
      });
    }
    const now = new Date();
    const [updated] = await tx.update(productionMaterialReceipt).set({
      status: input.decision === 'verify' ? 'verified' : 'rejected',
      reviewedByUserId: actorUserId,
      reviewedAt: now,
      reviewNote: input.note,
    }).where(and(eq(productionMaterialReceipt.id, receipt.id), eq(productionMaterialReceipt.status, 'pending')))
      .returning({ id: productionMaterialReceipt.id });
    if (!updated) throw new MaterialAccountingError('CONCURRENT_REVIEW', 'Receipt review changed concurrently; refresh and try again.');
    await tx.insert(auditLog).values({
      userId: actorUserId,
      action: input.decision === 'verify' ? 'PRODUCTION_MATERIAL_RECEIPT_VERIFIED' : 'PRODUCTION_MATERIAL_RECEIPT_REJECTED',
      targetType: 'production_material_receipt',
      targetId: receipt.id,
      beforeState: { status: 'pending' },
      afterState: { status: input.decision === 'verify' ? 'verified' : 'rejected' },
      metadata: JSON.stringify({ manufacturerId: receipt.manufacturerId, materialCode: material.materialCode, quantity: receipt.quantity, unit: receipt.unit, origin: receipt.origin, evidenceReference: receipt.evidenceReference, decisionNote: input.note }),
    });
    return { receiptId: receipt.id, status: input.decision === 'verify' ? 'verified' : 'rejected', replayed: false, manufacturerId: receipt.manufacturerId };
  });

  if (!result.replayed) {
    await notifySafely({ userId: result.manufacturerId, type: 'system', title: result.status === 'verified' ? 'Material receipt verified' : 'Material receipt not verified', message: result.status === 'verified' ? 'The verified quantity is now included in your confidential material balance.' : 'The receipt was not verified. Review the decision note and submit corrected evidence if needed.', link: '/dashboard/production' });
  }
  return result;
}

export async function listPendingProductionBatchReviews(batchId?: string) {
  const batches = await db.select({
    id: productionBatch.id,
    manufacturerId: productionBatch.manufacturerId,
    manufacturerName: user.businessName,
    productId: productionBatch.productId,
    productName: product.name,
    batchReference: productionBatch.batchReference,
    outputQuantity: productionBatch.declaredQuantity,
    outputUnit: product.unit,
    validationStatus: productionBatch.productionValidationStatus,
    createdAt: productionBatch.createdAt,
  }).from(productionBatch)
    .innerJoin(user, eq(productionBatch.manufacturerId, user.id))
    .innerJoin(product, eq(productionBatch.productId, product.id))
    .where(and(
      eq(productionBatch.materialReviewStatus, 'pending'),
      ...(batchId ? [eq(productionBatch.id, batchId)] : []),
    ))
    .orderBy(productionBatch.createdAt)
    .limit(batchId ? 1 : 250);

  const batchIds = batches.map((batch) => batch.id);
  if (batchIds.length === 0) return [];
  const usages = await db.select({
    batchId: productionBatchMaterialUsage.productionBatchId,
    materialId: productionBatchMaterialUsage.materialId,
    materialCode: productionMaterial.materialCode,
    materialUnit: productionMaterial.unit,
    actualQuantity: productionBatchMaterialUsage.actualQuantity,
    consumptionToleranceBasisPoints: productionBatchMaterialUsage.consumptionToleranceBasisPoints,
  }).from(productionBatchMaterialUsage)
    .innerJoin(productionMaterial, eq(productionBatchMaterialUsage.materialId, productionMaterial.id))
    .where(inArray(productionBatchMaterialUsage.productionBatchId, batchIds));
  const balances = await db.select({ materialId: productionMaterialMovement.materialId, balance: sql<string>`COALESCE(SUM(${productionMaterialMovement.quantityDelta}), 0)::text` })
    .from(productionMaterialMovement)
    .where(usages.length ? inArray(productionMaterialMovement.materialId, [...new Set(usages.map((usage) => usage.materialId))]) : sql`false`)
    .groupBy(productionMaterialMovement.materialId);
  const balanceByMaterial = new Map(balances.map((row) => [row.materialId, decimalToMicros(row.balance)]));
  const usagesByBatch = new Map<string, typeof usages>();
  for (const usage of usages) usagesByBatch.set(usage.batchId, [...(usagesByBatch.get(usage.batchId) ?? []), usage]);
  const comparisonRows = await db.select({
    batchId: productionHistoryComparison.productionBatchId,
    snapshot: productionHistoryComparison.snapshot,
  }).from(productionHistoryComparison)
    .where(inArray(productionHistoryComparison.productionBatchId, batchIds));
  const comparisonsByBatch = new Map(comparisonRows.map((row) => {
    const parsed = storedComparisonSchema.safeParse(row.snapshot);
    return [row.batchId, parsed.success ? parsed.data : null] as const;
  }));
  return batches.map((batch) => ({
    ...batch,
    historyComparison: comparisonsByBatch.get(batch.id) ?? null,
    materials: (usagesByBatch.get(batch.id) ?? []).map((usage) => {
      const balance = balanceByMaterial.get(usage.materialId) ?? BigInt(0);
      const required = quantityToMicros(usage.actualQuantity);
      return {
        materialId: usage.materialId,
        materialCode: usage.materialCode,
        unit: usage.materialUnit,
        requiredQuantity: microsToDecimal(required),
        availableQuantity: microsToDecimal(balance),
        shortage: microsToDecimal(balance >= required ? BigInt(0) : required - balance),
      };
    }),
  }));
}

export async function reviewProductionBatch(actorUserId: string, input: BatchReviewInput) {
  const result = await db.transaction(async (tx) => {
    const [batch] = await tx.select().from(productionBatch).where(eq(productionBatch.id, input.batchId)).for('update').limit(1);
    if (!batch) throw new MaterialAccountingError('NOT_FOUND', 'Production batch was not found.');
    if (batch.materialReviewStatus === 'released') return { batchId: batch.id, manufacturerId: batch.manufacturerId, status: 'released', replayed: true };
    if (batch.materialReviewStatus !== 'pending' || !batch.recipeVersionId) throw new MaterialAccountingError('NOT_PENDING', 'This batch is not awaiting material review.');

    if (input.decision === 'reject') {
      const now = new Date();
      await tx.update(productionBatch).set({ materialReviewStatus: 'rejected', materialReviewNote: input.note, materialReviewedById: actorUserId, materialReviewedAt: now, status: 'held_material_review' })
        .where(and(eq(productionBatch.id, batch.id), eq(productionBatch.materialReviewStatus, 'pending')));
      await tx.insert(auditLog).values({ userId: actorUserId, action: 'PRODUCTION_BATCH_MATERIAL_REVIEW_REJECTED', targetType: 'production_batch', targetId: batch.id, beforeState: { materialReviewStatus: 'pending' }, afterState: { materialReviewStatus: 'rejected', status: 'held_material_review' }, metadata: JSON.stringify({ manufacturerId: batch.manufacturerId, batchReference: batch.batchReference, decisionNote: input.note }) });
      return { batchId: batch.id, manufacturerId: batch.manufacturerId, status: 'rejected', replayed: false };
    }

    const usages = await tx.select({
      id: productionBatchMaterialUsage.id,
      materialId: productionBatchMaterialUsage.materialId,
      actualQuantity: productionBatchMaterialUsage.actualQuantity,
      materialUnit: productionMaterial.unit,
      materialManufacturerId: productionMaterial.manufacturerId,
      materialCode: productionMaterial.materialCode,
    }).from(productionBatchMaterialUsage)
      .innerJoin(productionMaterial, eq(productionBatchMaterialUsage.materialId, productionMaterial.id))
      .where(eq(productionBatchMaterialUsage.productionBatchId, batch.id));
    if (usages.length === 0 || usages.some((usage) => usage.materialManufacturerId !== batch.manufacturerId)) {
      throw new MaterialAccountingError('MATERIAL_EVIDENCE_MISSING', 'Batch material evidence is incomplete or does not belong to the manufacturer.');
    }
    const sortedMaterialIds = [...new Set(usages.map((usage) => usage.materialId))].sort();
    for (const materialId of sortedMaterialIds) {
      const [locked] = await tx.select({ id: productionMaterial.id }).from(productionMaterial).where(eq(productionMaterial.id, materialId)).for('update').limit(1);
      if (!locked) throw new MaterialAccountingError('MATERIAL_NOT_FOUND', 'A batch material no longer exists.');
    }
    const computed = new Map<string, { before: bigint; used: bigint; code: string; unit: string }>();
    for (const usage of usages) {
      const entry = computed.get(usage.materialId) ?? { before: await getMaterialBalance(tx, batch.manufacturerId, usage.materialId), used: BigInt(0), code: usage.materialCode, unit: usage.materialUnit };
      entry.used += quantityToMicros(usage.actualQuantity);
      computed.set(usage.materialId, entry);
    }
    const shortages = [...computed.entries()].filter(([, entry]) => entry.before < entry.used).map(([materialId, entry]) => ({ materialId, materialCode: entry.code, unit: entry.unit, shortage: microsToDecimal(entry.used - entry.before) }));
    if (shortages.length > 0) throw new MaterialAccountingError('MATERIAL_SHORTAGE', `Insufficient verified material stock: ${shortages.map((item) => `${item.materialCode} short ${item.shortage} ${item.unit}`).join('; ')}`);

    const now = new Date();
    for (const usage of usages) {
      const entry = computed.get(usage.materialId);
      if (!entry) throw new Error('Material balance calculation was incomplete.');
      const delta = -quantityToMicros(usage.actualQuantity);
      const before = entry.before;
      const after = before + delta;
      // Zero actual usage is valid evidence, but the immutable ledger rejects
      // zero-value movements. Preserve the usage row without inventing one.
      if (delta === BigInt(0)) continue;
      await tx.insert(productionMaterialMovement).values({
        manufacturerId: batch.manufacturerId,
        materialId: usage.materialId,
        movementType: 'consumption',
        quantityDelta: microsToDecimal(delta),
        quantityBefore: microsToDecimal(before),
        quantityAfter: microsToDecimal(after),
        productionBatchId: batch.id,
        batchUsageId: usage.id,
        actorUserId,
        reason: `Verified production batch ${batch.batchReference} consumption`,
      });
      entry.before = after;
    }

    const [updatedStock] = await tx.insert(stock).values({ businessId: batch.manufacturerId, productId: batch.productId, quantity: batch.declaredQuantity, source: 'manufactured', price: batch.unitPrice })
      .onConflictDoUpdate({ target: [stock.businessId, stock.productId], set: { quantity: sql`${stock.quantity} + ${batch.declaredQuantity}`, price: batch.unitPrice, source: 'manufactured', updatedAt: now } })
      .returning({ quantity: stock.quantity });
    if (!updatedStock) throw new Error('Finished-product inventory update returned no row.');
    const quantityBefore = updatedStock.quantity - batch.declaredQuantity;
    await tx.insert(stockMovement).values({ businessId: batch.manufacturerId, productId: batch.productId, quantityDelta: batch.declaredQuantity, quantityBefore, quantityAfter: updatedStock.quantity, movementType: 'production', sourceType: 'production_batch', sourceId: batch.id, actorUserId, reason: 'Material-reviewed production batch released' });

    const [updatedBatch] = await tx.update(productionBatch).set({ materialReviewStatus: 'released', materialReviewNote: input.note, materialReviewedById: actorUserId, materialReviewedAt: now, materialPostedAt: now, status: 'independently_supported' })
      .where(and(eq(productionBatch.id, batch.id), eq(productionBatch.materialReviewStatus, 'pending')))
      .returning({ id: productionBatch.id });
    if (!updatedBatch) throw new MaterialAccountingError('CONCURRENT_REVIEW', 'Batch state changed concurrently; no posting was completed.');
    if (batch.materialPlanId) {
      await tx.update(productionMaterialPlan).set({ status: 'completed' })
        .where(and(eq(productionMaterialPlan.id, batch.materialPlanId), eq(productionMaterialPlan.status, 'in_progress')));
    }
    await tx.insert(auditLog).values({ userId: actorUserId, action: 'PRODUCTION_BATCH_MATERIAL_REVIEW_RELEASED', targetType: 'production_batch', targetId: batch.id, beforeState: { materialReviewStatus: 'pending', stockQuantity: quantityBefore }, afterState: { materialReviewStatus: 'released', stockQuantity: updatedStock.quantity }, metadata: JSON.stringify({ manufacturerId: batch.manufacturerId, batchReference: batch.batchReference, outputProductId: batch.productId, outputQuantity: batch.declaredQuantity, materialCount: usages.length, materialCodes: usages.map((usage) => usage.materialCode), decisionNote: input.note }) });
    return { batchId: batch.id, manufacturerId: batch.manufacturerId, status: 'released', replayed: false };
  });

  if (!result.replayed) {
    await notifySafely({ userId: result.manufacturerId, type: 'system', title: result.status === 'released' ? 'Production batch released' : 'Production batch held', message: result.status === 'released' ? 'Verified material consumption and finished-product stock were posted together.' : 'The production batch remains held. Review the officer decision and resolve the recorded discrepancy.', link: '/dashboard/production' });
  }
  return result;
}

export async function adjustProductionMaterialStock(actorUserId: string, input: AdjustmentInput) {
  const delta = quantityToMicros(input.quantityDelta);
  return db.transaction(async (tx) => {
    const [material] = await tx.select({ id: productionMaterial.id, manufacturerId: productionMaterial.manufacturerId, materialCode: productionMaterial.materialCode })
      .from(productionMaterial).where(eq(productionMaterial.id, input.materialId)).for('update').limit(1);
    if (!material) throw new MaterialAccountingError('MATERIAL_NOT_FOUND', 'Material was not found.');
    const before = await getMaterialBalance(tx, material.manufacturerId, material.id);
    const after = before + delta;
    if (after < BigInt(0)) throw new MaterialAccountingError('MATERIAL_SHORTAGE', 'An adjustment cannot reduce verified material stock below zero.');
    await tx.insert(productionMaterialMovement).values({ manufacturerId: material.manufacturerId, materialId: material.id, movementType: 'adjustment', quantityDelta: microsToDecimal(delta), quantityBefore: microsToDecimal(before), quantityAfter: microsToDecimal(after), sourceReference: input.evidenceReference, actorUserId, reason: input.reason });
    await tx.insert(auditLog).values({ userId: actorUserId, action: 'PRODUCTION_MATERIAL_STOCK_ADJUSTED', targetType: 'production_material', targetId: material.id, beforeState: { balance: microsToDecimal(before) }, afterState: { balance: microsToDecimal(after) }, metadata: JSON.stringify({ manufacturerId: material.manufacturerId, materialCode: material.materialCode, quantityDelta: microsToDecimal(delta), evidenceReference: input.evidenceReference, reason: input.reason }) });
    return { materialId: material.id, balance: microsToDecimal(after) };
  });
}

export async function listIncomingConfirmedTransactions(manufacturerId: string) {
  const rows = await db.select({ id: transaction.id, sellerName: user.businessName, productName: product.name, unit: product.unit, quantity: transaction.quantity, invoiceReference: transaction.invoiceReference, confirmedAt: transaction.confirmedAt })
    .from(transaction)
    .innerJoin(product, eq(transaction.productId, product.id))
    .innerJoin(user, eq(transaction.sellerId, user.id))
    .innerJoin(b2bOrderAcceptance, and(eq(b2bOrderAcceptance.transactionId, transaction.id), eq(b2bOrderAcceptance.buyerBusinessId, manufacturerId)))
    .where(and(eq(transaction.buyerId, manufacturerId), eq(transaction.status, 'confirmed')))
    .orderBy(desc(transaction.confirmedAt)).limit(100);
  const claims = rows.length ? await db.select({ transactionId: productionMaterialReceipt.transactionId, quantity: sql<string>`COALESCE(SUM(${productionMaterialReceipt.quantity}), 0)::text` })
    .from(productionMaterialReceipt)
    .where(and(inArray(productionMaterialReceipt.transactionId, rows.map((row) => row.id)), inArray(productionMaterialReceipt.status, ['pending', 'verified'])))
    .groupBy(productionMaterialReceipt.transactionId) : [];
  const claimed = new Map(claims.map((row) => [row.transactionId, decimalToMicros(row.quantity)]));
  return rows.map((row) => ({ ...row, remainingQuantity: microsToDecimal(quantityToMicros(row.quantity) - (claimed.get(row.id) ?? BigInt(0))) }));
}
