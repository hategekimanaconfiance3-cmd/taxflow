import 'server-only';

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import db from '@/db/drizzle';
import { auditLog, product, productionBatch, productionBatchMaterialUsage, productionMaterial, productionMaterialPlan, productionMaterialPlanLine, productionRecipe, productionRecipeMaterial, stock, stockMovement } from '@/db/schema';
import { getSystemConfig } from '@/lib/actions/system-config.action';
import type { ProductionEntryInput, ProductRegistrationInput, productionRecipeSchema } from '@/lib/validation/production.schema';
import { assessMaterialVariance, calculatePlannedMaterialQuantity, combineMaterialValidation } from '@/lib/production-confidentiality';
import { decimalToMicros, quantityToMicros } from '@/lib/material-accounting';
import { notifyProductionBatchSubmitted } from '@/lib/material-accounting-service';

type ProductionRecipeInput = typeof productionRecipeSchema._output;

class RecipeUnitMismatchError extends Error {}

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
  productionValidationStatus: string;
  createdAt: string;
}

export interface ManufacturerRecipe {
  id: string;
  productId: string;
  productName: string;
  productUnit: string;
  version: number;
  outputQuantity: number;
  yieldToleranceBasisPoints: number;
  materials: Array<{ recipeMaterialId: string; materialId: string; materialCode: string; name: string; unit: string; quantity: number }>;
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
    productionValidationStatus: productionBatch.productionValidationStatus,
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
      productionValidationStatus: row.productionValidationStatus,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export async function listManufacturerRecipes(manufacturerId: string): Promise<ManufacturerRecipe[]> {
  const recipes = await db.select({
    id: productionRecipe.id,
    productId: productionRecipe.productId,
    productName: product.name,
    productUnit: product.unit,
    version: productionRecipe.version,
    outputQuantity: productionRecipe.outputQuantity,
    yieldToleranceBasisPoints: productionRecipe.yieldToleranceBasisPoints,
  }).from(productionRecipe)
    .innerJoin(product, eq(productionRecipe.productId, product.id))
    .where(eq(productionRecipe.manufacturerId, manufacturerId))
    .orderBy(desc(productionRecipe.createdAt))
    .limit(200);

  if (recipes.length === 0) return [];
  const recipeIds = recipes.map((recipe) => recipe.id);
  const materials = await db.select({
    recipeVersionId: productionRecipeMaterial.recipeVersionId,
    recipeMaterialId: productionRecipeMaterial.id,
    materialId: productionMaterial.id,
    materialCode: productionMaterial.materialCode,
    name: productionMaterial.confidentialName,
    unit: productionMaterial.unit,
    quantity: productionRecipeMaterial.quantity,
  }).from(productionRecipeMaterial)
    .innerJoin(productionMaterial, eq(productionRecipeMaterial.materialId, productionMaterial.id))
    .where(inArray(productionRecipeMaterial.recipeVersionId, recipeIds));
  const materialsByRecipe = new Map<string, ManufacturerRecipe['materials']>();
  for (const material of materials) {
    const rows = materialsByRecipe.get(material.recipeVersionId) ?? [];
    rows.push({
      recipeMaterialId: material.recipeMaterialId,
      materialId: material.materialId,
      materialCode: material.materialCode,
      name: material.name,
      unit: material.unit,
      quantity: material.quantity,
    });
    materialsByRecipe.set(material.recipeVersionId, rows);
  }
  return recipes.map((recipe) => ({ ...recipe, materials: materialsByRecipe.get(recipe.id) ?? [] }));
}

export async function createManufacturerRecipe(manufacturerId: string, input: ProductionRecipeInput): Promise<{ ok: true; recipe: ManufacturerRecipe } | { ok: false; code: 'PRODUCT_NOT_FOUND' | 'MATERIAL_UNIT_MISMATCH' }> {
  let recipe: ManufacturerRecipe | null;
  try {
    recipe = await db.transaction(async (tx) => {
    const [ownedProduct] = await tx.select({ id: product.id, name: product.name, unit: product.unit })
      .from(product)
      .where(and(eq(product.id, input.productId), eq(product.createdByUserId, manufacturerId)))
      .for('update')
      .limit(1);
    if (!ownedProduct) return null;

    const [latest] = await tx.select({ version: productionRecipe.version })
      .from(productionRecipe)
      .where(and(eq(productionRecipe.manufacturerId, manufacturerId), eq(productionRecipe.productId, input.productId)))
      .orderBy(desc(productionRecipe.version))
      .limit(1);
    const version = (latest?.version ?? 0) + 1;
    const recipeCode = `R-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
    const [createdRecipe] = await tx.insert(productionRecipe).values({
      manufacturerId,
      productId: input.productId,
      recipeCode,
      version,
      outputQuantity: input.outputQuantity,
      yieldToleranceBasisPoints: input.yieldToleranceBasisPoints,
      createdByUserId: manufacturerId,
    }).returning({ id: productionRecipe.id });
    if (!createdRecipe) throw new Error('Recipe version creation returned no row');

    const lines: ManufacturerRecipe['materials'] = [];
    for (const materialInput of input.materials) {
      const [existingMaterial] = await tx.select({ id: productionMaterial.id, unit: productionMaterial.unit, code: productionMaterial.materialCode })
        .from(productionMaterial)
        .where(and(
          eq(productionMaterial.manufacturerId, manufacturerId),
          sql`lower(${productionMaterial.confidentialName}) = lower(${materialInput.name})`,
        ))
        .for('update')
        .limit(1);
      if (existingMaterial && existingMaterial.unit !== materialInput.unit) throw new RecipeUnitMismatchError();

      const createdMaterial = existingMaterial ? null : (await tx.insert(productionMaterial).values({
        manufacturerId,
        materialCode: `M-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
        confidentialName: materialInput.name,
        unit: materialInput.unit,
      }).returning({ id: productionMaterial.id, materialCode: productionMaterial.materialCode, unit: productionMaterial.unit }))[0];
      const materialId = existingMaterial?.id ?? createdMaterial?.id;
      const materialCode = existingMaterial?.code ?? createdMaterial?.materialCode;
      const materialUnit = existingMaterial?.unit ?? createdMaterial?.unit;
      if (!materialId || !materialCode || !materialUnit) throw new Error('Material creation returned no row');
      const [line] = await tx.insert(productionRecipeMaterial).values({
        recipeVersionId: createdRecipe.id,
        materialId,
        quantity: materialInput.quantity,
      }).returning({ id: productionRecipeMaterial.id });
      if (!line) throw new Error('Recipe material creation returned no row');
      lines.push({
        recipeMaterialId: line.id,
        materialId,
        materialCode,
        name: materialInput.name,
        unit: materialUnit,
        quantity: materialInput.quantity,
      });
    }

    await tx.insert(auditLog).values({
      userId: manufacturerId,
      action: 'PRODUCTION_RECIPE_VERSION_CREATED',
      targetType: 'production_recipe',
      targetId: createdRecipe.id,
      metadata: JSON.stringify({ recipeCode, version, productId: input.productId, materialCount: lines.length }),
    });

    return {
      id: createdRecipe.id,
      productId: input.productId,
      productName: ownedProduct.name,
      productUnit: ownedProduct.unit,
      version,
      outputQuantity: input.outputQuantity,
      yieldToleranceBasisPoints: input.yieldToleranceBasisPoints,
      materials: lines,
    } satisfies ManufacturerRecipe;
    });
  } catch (error) {
    if (error instanceof RecipeUnitMismatchError) return { ok: false, code: 'MATERIAL_UNIT_MISMATCH' };
    throw error;
  }

  if (recipe === null) return { ok: false, code: 'PRODUCT_NOT_FOUND' };
  return { ok: true, recipe };
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
  const recipeInputHash = input.recipeVersionId
    ? createHash('sha256').update(JSON.stringify({
      recipeVersionId: input.recipeVersionId,
      actualMaterials: [...(input.actualMaterials ?? [])]
        .sort((left, right) => left.recipeMaterialId.localeCompare(right.recipeMaterialId)),
      plannedOutputQuantity: input.plannedOutputQuantity,
      materialPlanId: input.materialPlanId ?? null,
    })).digest('hex')
    : null;
  const now = new Date();
  const batchReference = `TF-BATCH-${now.toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;

  const result = await db.transaction(async (tx) => {
    const [ownedProduct] = await tx.select({ id: product.id, name: product.name, unit: product.unit })
      .from(product)
      .where(and(eq(product.id, input.productId), eq(product.createdByUserId, manufacturerId)))
      .for('update')
      .limit(1);

    if (!ownedProduct) return { ok: false as const, code: 'PRODUCT_NOT_FOUND' as const };

    const [priorBatch] = await tx.select({
      id: productionBatch.id,
      batchReference: productionBatch.batchReference,
      productId: productionBatch.productId,
      quantity: productionBatch.declaredQuantity,
      unitPrice: productionBatch.unitPrice,
      vatRateBasisPoints: productionBatch.vatRateBasisPoints,
      recipeVersionId: productionBatch.recipeVersionId,
      recipeInputHash: productionBatch.recipeInputHash,
      productionValidationStatus: productionBatch.productionValidationStatus,
      status: productionBatch.status,
      createdAt: productionBatch.createdAt,
    }).from(productionBatch)
      .where(and(eq(productionBatch.manufacturerId, manufacturerId), eq(productionBatch.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    if (priorBatch) {
      if (priorBatch.productId !== input.productId || priorBatch.quantity !== input.quantity
        || priorBatch.unitPrice !== input.unitPrice || priorBatch.recipeInputHash !== recipeInputHash) {
        return { ok: false as const, code: 'DUPLICATE_REQUEST' as const };
      }
      const replayVatRate = priorBatch.vatRateBasisPoints / 10_000;
      const replayTotal = Math.round(priorBatch.quantity * priorBatch.unitPrice);
      return {
        ok: true as const,
        replayed: true,
        record: {
          id: priorBatch.id,
          productId: priorBatch.productId,
          productName: ownedProduct.name,
          unit: ownedProduct.unit,
          batchReference: priorBatch.batchReference,
          quantity: priorBatch.quantity,
          unitPrice: priorBatch.unitPrice,
          totalValue: replayTotal,
          vatRate: replayVatRate,
          potentialTax: Math.round(replayTotal * replayVatRate),
          status: priorBatch.status ?? 'recorded',
          productionValidationStatus: priorBatch.productionValidationStatus,
          createdAt: priorBatch.createdAt.toISOString(),
        },
      };
    }

    let recipeLines: Array<{ id: string; materialId: string; quantity: number }> = [];
    let productionValidationStatus: 'not_applicable' | 'within_tolerance' | 'review_required' = 'not_applicable';
    let plannedMaterialUsage: Array<{ recipeMaterialId: string; materialId: string; plannedQuantity: number; actualQuantity: number }> = [];
    if (input.recipeVersionId) {
      const [recipe] = await tx.select({
        id: productionRecipe.id,
        outputQuantity: productionRecipe.outputQuantity,
        yieldToleranceBasisPoints: productionRecipe.yieldToleranceBasisPoints,
      }).from(productionRecipe)
        .where(and(
          eq(productionRecipe.id, input.recipeVersionId),
          eq(productionRecipe.manufacturerId, manufacturerId),
          eq(productionRecipe.productId, input.productId),
        ))
        .limit(1);
      if (!recipe) return { ok: false as const, code: 'RECIPE_NOT_FOUND' as const };
      const outputCheck = assessMaterialVariance(input.plannedOutputQuantity!, input.quantity, recipe.yieldToleranceBasisPoints);

      recipeLines = await tx.select({
        id: productionRecipeMaterial.id,
        materialId: productionRecipeMaterial.materialId,
        quantity: productionRecipeMaterial.quantity,
      }).from(productionRecipeMaterial)
        .where(eq(productionRecipeMaterial.recipeVersionId, recipe.id));
      const actualByLine = new Map((input.actualMaterials ?? []).map((item) => [item.recipeMaterialId, item.actualQuantity]));
      if (recipeLines.length === 0 || actualByLine.size !== recipeLines.length
        || recipeLines.some((line) => !actualByLine.has(line.id))) {
        return { ok: false as const, code: 'MATERIAL_USAGE_MISMATCH' as const };
      }

      if (input.materialPlanId) {
        const [plan] = await tx.select({
          id: productionMaterialPlan.id,
          productId: productionMaterialPlan.productId,
          recipeVersionId: productionMaterialPlan.recipeVersionId,
          plannedOutputQuantity: productionMaterialPlan.plannedOutputQuantity,
          status: productionMaterialPlan.status,
        }).from(productionMaterialPlan)
          .where(and(eq(productionMaterialPlan.id, input.materialPlanId), eq(productionMaterialPlan.manufacturerId, manufacturerId)))
          .for('update').limit(1);
        if (!plan || plan.status !== 'planned' || plan.productId !== input.productId || plan.recipeVersionId !== recipe.id
          || decimalToMicros(plan.plannedOutputQuantity) !== quantityToMicros(input.plannedOutputQuantity!)) {
          return { ok: false as const, code: 'PLAN_NOT_AVAILABLE' as const };
        }
        const planLines = await tx.select({ recipeMaterialId: productionMaterialPlanLine.recipeMaterialId })
          .from(productionMaterialPlanLine).where(eq(productionMaterialPlanLine.planId, plan.id));
        if (planLines.length !== recipeLines.length || planLines.some((line) => !recipeLines.some((recipeLine) => recipeLine.id === line.recipeMaterialId))) {
          return { ok: false as const, code: 'PLAN_MISMATCH' as const };
        }
      }

      const materialChecks = recipeLines.map((line) => {
        const plannedQuantity = calculatePlannedMaterialQuantity(input.plannedOutputQuantity!, recipe.outputQuantity, line.quantity);
        const actualQuantity = actualByLine.get(line.id);
        if (actualQuantity === undefined) throw new Error('Validated material usage is missing');
        return {
          ...assessMaterialVariance(plannedQuantity, actualQuantity, recipe.yieldToleranceBasisPoints),
          recipeMaterialId: line.id,
          materialId: line.materialId,
          plannedQuantity,
          actualQuantity,
        };
      });
      productionValidationStatus = combineMaterialValidation([outputCheck.status, ...materialChecks.map((item) => item.status)]);
      plannedMaterialUsage = materialChecks.map(({ recipeMaterialId, materialId, plannedQuantity, actualQuantity }) => ({
        recipeMaterialId,
        materialId,
        plannedQuantity,
        actualQuantity,
      }));
    } else if (input.actualMaterials?.length) {
      return { ok: false as const, code: 'MATERIAL_USAGE_MISMATCH' as const };
    }

    const [batch] = await tx.insert(productionBatch).values({
      manufacturerId,
      productId: input.productId,
      batchReference,
      declaredQuantity: input.quantity,
      unitPrice: input.unitPrice,
      vatRateBasisPoints,
      recipeVersionId: input.recipeVersionId ?? null,
      plannedOutputQuantity: input.plannedOutputQuantity ?? null,
      productionValidationStatus,
      recipeInputHash,
      idempotencyKey: input.idempotencyKey,
      materialPlanId: input.materialPlanId ?? null,
      materialReviewStatus: input.recipeVersionId ? 'pending' : 'not_required',
      status: input.recipeVersionId ? 'held_material_review' : 'recorded',
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
        recipeVersionId: productionBatch.recipeVersionId,
        recipeInputHash: productionBatch.recipeInputHash,
        productionValidationStatus: productionBatch.productionValidationStatus,
        status: productionBatch.status,
        createdAt: productionBatch.createdAt,
      }).from(productionBatch)
        .where(and(
          eq(productionBatch.manufacturerId, manufacturerId),
          eq(productionBatch.idempotencyKey, input.idempotencyKey),
        )).limit(1);

      if (!existing || existing.productId !== input.productId || existing.quantity !== input.quantity
        || existing.unitPrice !== input.unitPrice || existing.recipeInputHash !== recipeInputHash) {
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
          status: existing.status ?? 'recorded',
          productionValidationStatus: existing.productionValidationStatus,
          createdAt: existing.createdAt.toISOString(),
        },
      };
    }

    if (plannedMaterialUsage.length > 0) {
      await tx.insert(productionBatchMaterialUsage).values(plannedMaterialUsage.map((usage) => ({
        productionBatchId: batch.id,
        recipeMaterialId: usage.recipeMaterialId,
        materialId: usage.materialId,
        plannedQuantity: usage.plannedQuantity,
        actualQuantity: usage.actualQuantity,
      })));
    }

    let quantityBefore: number | null = null;
    let quantityAfter: number | null = null;
    if (plannedMaterialUsage.length === 0) {
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
      quantityBefore = updatedStock.quantity - input.quantity;
      quantityAfter = updatedStock.quantity;
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
    } else if (input.materialPlanId) {
      const [claimedPlan] = await tx.update(productionMaterialPlan).set({ status: 'in_progress' })
        .where(and(eq(productionMaterialPlan.id, input.materialPlanId), eq(productionMaterialPlan.status, 'planned')))
        .returning({ id: productionMaterialPlan.id });
      if (!claimedPlan) throw new Error('Production plan was claimed by another batch.');
    }

    const auditEvents = plannedMaterialUsage.length > 0
      ? ['PRODUCTION_CREATED', 'BATCH_CREATED'] as const
      : ['PRODUCTION_CREATED', 'BATCH_CREATED', 'INVENTORY_INCREASED'] as const;
    await tx.insert(auditLog).values(auditEvents.map((action) => ({
      userId: manufacturerId,
      action,
      targetType: 'production_batch',
      targetId: batch.id,
      beforeState: quantityBefore === null ? null : { stockQuantity: quantityBefore },
      afterState: quantityAfter === null ? { materialReviewStatus: 'pending', finishedGoodsPosted: false } : { stockQuantity: quantityAfter },
      metadata: JSON.stringify({
        productId: input.productId,
        batchId: batch.id,
        batchReference: batch.batchReference,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        totalValue,
        vatRateBasisPoints,
        potentialTax,
        recipeAttached: Boolean(input.recipeVersionId),
        productionValidationStatus,
        materialCount: plannedMaterialUsage.length,
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
      status: input.recipeVersionId ? 'held_material_review' : 'recorded',
        productionValidationStatus,
        createdAt: now.toISOString(),
      },
    };
  });

  if (result.ok && !result.replayed && input.recipeVersionId) {
    try {
      await notifyProductionBatchSubmitted(result.record.id);
    } catch (error) {
      console.error('[production:material-review-notification]', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    }
  }
  return result;
}
