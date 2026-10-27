import 'server-only';

import { and, desc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import db from '@/db/drizzle';
import {
  aiFinding,
  auditLog,
  manufacturingMaterial,
  manufacturingRecipe,
  manufacturingRecipeMaterial,
  product,
  productionBatch,
  productionBatchMaterial,
  stock,
  stockMovement,
  user,
} from '@/db/schema';
import { getSystemConfig } from '@/lib/actions/system-config.action';
import { sanitizeProductionMaterialEvidence } from '@/lib/production-confidentiality';
import type {
  ManufacturingMaterialInput,
  ManufacturingRecipeInput,
  ProductionEntryInput,
  ProductRegistrationInput,
} from '@/lib/validation/production.schema';

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

export async function listManufacturerMaterials(manufacturerId: string) {
  return db.select({
    id: manufacturingMaterial.id,
    materialCode: manufacturingMaterial.materialCode,
    name: manufacturingMaterial.confidentialName,
    unit: manufacturingMaterial.unit,
  }).from(manufacturingMaterial)
    .where(eq(manufacturingMaterial.manufacturerId, manufacturerId))
    .orderBy(manufacturingMaterial.materialCode);
}

export async function createManufacturerMaterial(manufacturerId: string, input: ManufacturingMaterialInput) {
  return db.transaction(async (tx) => {
    await tx.select({ id: user.id }).from(user).where(eq(user.id, manufacturerId)).for('update');
    const [sequence] = await tx.select({
      value: sql<number>`COALESCE(MAX(SUBSTRING(${manufacturingMaterial.materialCode} FROM 3)::integer), 0)::int`,
    }).from(manufacturingMaterial).where(eq(manufacturingMaterial.manufacturerId, manufacturerId));
    const materialCode = `M-${String(Number(sequence?.value ?? 0) + 1).padStart(3, '0')}`;
    const [created] = await tx.insert(manufacturingMaterial).values({
      manufacturerId,
      materialCode,
      confidentialName: input.name,
      unit: input.unit,
    }).returning({
      id: manufacturingMaterial.id,
      materialCode: manufacturingMaterial.materialCode,
      name: manufacturingMaterial.confidentialName,
      unit: manufacturingMaterial.unit,
    });
    if (!created) throw new Error('Material registration returned no row');
    await tx.insert(auditLog).values({
      userId: manufacturerId,
      action: 'MANUFACTURING_MATERIAL_REGISTERED',
      targetType: 'manufacturing_material',
      targetId: created.id,
      metadata: JSON.stringify({ materialCode: created.materialCode, unit: created.unit }),
    });
    return created;
  });
}

export async function listManufacturerRecipes(manufacturerId: string) {
  const recipes = await db.select({
    id: manufacturingRecipe.id,
    productId: manufacturingRecipe.productId,
    productName: product.name,
    version: manufacturingRecipe.version,
    batchOutputQuantity: manufacturingRecipe.batchOutputQuantity,
    materialTolerancePercent: manufacturingRecipe.materialTolerancePercent,
    createdAt: manufacturingRecipe.createdAt,
  }).from(manufacturingRecipe)
    .innerJoin(product, eq(manufacturingRecipe.productId, product.id))
    .where(eq(manufacturingRecipe.manufacturerId, manufacturerId))
    .orderBy(desc(manufacturingRecipe.createdAt));

  if (recipes.length === 0) return [];
  const recipeIds = recipes.map((recipe) => recipe.id);
  const lines = await db.select({
    recipeId: manufacturingRecipeMaterial.recipeId,
    materialId: manufacturingMaterial.id,
    materialCode: manufacturingMaterial.materialCode,
    materialName: manufacturingMaterial.confidentialName,
    unit: manufacturingMaterial.unit,
    plannedQuantity: manufacturingRecipeMaterial.plannedQuantity,
  }).from(manufacturingRecipeMaterial)
    .innerJoin(manufacturingMaterial, eq(manufacturingRecipeMaterial.materialId, manufacturingMaterial.id))
    .where(sql`${manufacturingRecipeMaterial.recipeId} IN (${sql.join(recipeIds.map((id) => sql`${id}`), sql`, `)})`);

  await db.insert(auditLog).values({
    userId: manufacturerId,
    action: 'MANUFACTURING_RECIPES_VIEWED',
    targetType: 'manufacturing_recipe',
    metadata: JSON.stringify({ recipeCount: recipes.length }),
  });

  return recipes.map((recipe) => ({
    ...recipe,
    materials: lines.filter((line) => line.recipeId === recipe.id),
  }));
}

export async function createManufacturerRecipe(manufacturerId: string, input: ManufacturingRecipeInput) {
  return db.transaction(async (tx) => {
    await tx.select({ id: user.id }).from(user).where(eq(user.id, manufacturerId)).for('update');
    const [ownedProduct] = await tx.select({ id: product.id }).from(product)
      .where(and(eq(product.id, input.productId), eq(product.createdByUserId, manufacturerId))).limit(1);
    if (!ownedProduct) return { ok: false as const, code: 'PRODUCT_NOT_FOUND' as const };

    const materialIds = input.materials.map((material) => material.materialId);
    const ownedMaterials = await tx.select({ id: manufacturingMaterial.id }).from(manufacturingMaterial)
      .where(and(eq(manufacturingMaterial.manufacturerId, manufacturerId), sql`${manufacturingMaterial.id} IN (${sql.join(materialIds.map((id) => sql`${id}`), sql`, `)})`));
    if (ownedMaterials.length !== materialIds.length) return { ok: false as const, code: 'MATERIAL_NOT_FOUND' as const };

    const [current] = await tx.select({ version: sql<number>`COALESCE(MAX(${manufacturingRecipe.version}), 0)::int` })
      .from(manufacturingRecipe)
      .where(and(eq(manufacturingRecipe.manufacturerId, manufacturerId), eq(manufacturingRecipe.productId, input.productId)));
    const version = Number(current?.version ?? 0) + 1;
    const [recipe] = await tx.insert(manufacturingRecipe).values({
      manufacturerId,
      productId: input.productId,
      version,
      batchOutputQuantity: input.batchOutputQuantity,
      materialTolerancePercent: input.materialTolerancePercent,
    }).returning({ id: manufacturingRecipe.id, version: manufacturingRecipe.version });
    if (!recipe) throw new Error('Recipe registration returned no row');

    await tx.insert(manufacturingRecipeMaterial).values(input.materials.map((material) => ({
      recipeId: recipe.id,
      materialId: material.materialId,
      plannedQuantity: material.plannedQuantity,
    })));
    await tx.insert(auditLog).values({
      userId: manufacturerId,
      action: 'MANUFACTURING_RECIPE_VERSION_CREATED',
      targetType: 'manufacturing_recipe',
      targetId: recipe.id,
      metadata: JSON.stringify({ productId: input.productId, version, materialCount: input.materials.length }),
    });
    return { ok: true as const, recipeId: recipe.id, version };
  });
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

export async function getProductionComplianceDetail(batchId: string) {
  const [batch] = await db.select({
    id: productionBatch.id,
    manufacturerId: productionBatch.manufacturerId,
    manufacturerName: user.businessName,
    productId: productionBatch.productId,
    productName: product.name,
    productUnit: product.unit,
    batchReference: productionBatch.batchReference,
    outputQuantity: productionBatch.declaredQuantity,
    plannedOutputQuantity: productionBatch.plannedQuantity,
    status: productionBatch.status,
    createdAt: productionBatch.createdAt,
  }).from(productionBatch)
    .innerJoin(product, eq(productionBatch.productId, product.id))
    .innerJoin(user, eq(productionBatch.manufacturerId, user.id))
    .where(eq(productionBatch.id, batchId))
    .limit(1);
  if (!batch) return null;

  const materials = await db.select({
    materialCode: manufacturingMaterial.materialCode,
    unit: manufacturingMaterial.unit,
    plannedQuantity: productionBatchMaterial.plannedQuantity,
    actualQuantity: productionBatchMaterial.actualQuantity,
  }).from(productionBatchMaterial)
    .innerJoin(manufacturingMaterial, eq(productionBatchMaterial.materialId, manufacturingMaterial.id))
    .where(eq(productionBatchMaterial.batchId, batchId));

  return { ...batch, materials: sanitizeProductionMaterialEvidence(materials) };
}

export async function listProductionComplianceRecords() {
  return db.select({
    id: productionBatch.id,
    manufacturerName: user.businessName,
    productName: product.name,
    batchReference: productionBatch.batchReference,
    outputQuantity: productionBatch.declaredQuantity,
    status: productionBatch.status,
    createdAt: productionBatch.createdAt,
  }).from(productionBatch)
    .innerJoin(product, eq(productionBatch.productId, product.id))
    .innerJoin(user, eq(productionBatch.manufacturerId, user.id))
    .orderBy(desc(productionBatch.createdAt))
    .limit(200);
}

export async function getConfidentialProductionMaterials(batchId: string, requesterId: string, reason: string) {
  const [batch] = await db.select({
    id: productionBatch.id,
    manufacturerId: productionBatch.manufacturerId,
    productId: productionBatch.productId,
    batchReference: productionBatch.batchReference,
  }).from(productionBatch).where(eq(productionBatch.id, batchId)).limit(1);
  if (!batch) return null;

  const materials = await db.select({
    materialCode: manufacturingMaterial.materialCode,
    confidentialName: manufacturingMaterial.confidentialName,
    unit: manufacturingMaterial.unit,
    plannedQuantity: productionBatchMaterial.plannedQuantity,
    actualQuantity: productionBatchMaterial.actualQuantity,
  }).from(productionBatchMaterial)
    .innerJoin(manufacturingMaterial, eq(productionBatchMaterial.materialId, manufacturingMaterial.id))
    .where(eq(productionBatchMaterial.batchId, batchId));

  await db.insert(auditLog).values({
    userId: requesterId,
    action: 'CONFIDENTIAL_FORMULA_ACCESSED',
    targetType: 'production_batch',
    targetId: batch.id,
    metadata: JSON.stringify({ reason, materialCount: materials.length, manufacturerId: batch.manufacturerId, productId: batch.productId }),
  });
  return { batchReference: batch.batchReference, materials };
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

    let plannedMaterials: Array<{
      recipeMaterialId: string;
      materialId: string;
      materialCode: string;
      plannedQuantity: number;
      actualQuantity: number;
    }> = [];
    let recipeVersion: number | null = null;
    let materialTolerancePercent = 5;
    if (input.recipeId) {
      const [recipe] = await tx.select({
        id: manufacturingRecipe.id,
        version: manufacturingRecipe.version,
        batchOutputQuantity: manufacturingRecipe.batchOutputQuantity,
        materialTolerancePercent: manufacturingRecipe.materialTolerancePercent,
      }).from(manufacturingRecipe).where(and(
        eq(manufacturingRecipe.id, input.recipeId),
        eq(manufacturingRecipe.manufacturerId, manufacturerId),
        eq(manufacturingRecipe.productId, input.productId),
      )).limit(1);
      if (!recipe) return { ok: false as const, code: 'RECIPE_NOT_FOUND' as const };
      const lines = await tx.select({
        recipeMaterialId: manufacturingRecipeMaterial.id,
        materialId: manufacturingMaterial.id,
        materialCode: manufacturingMaterial.materialCode,
        plannedQuantity: manufacturingRecipeMaterial.plannedQuantity,
      }).from(manufacturingRecipeMaterial)
        .innerJoin(manufacturingMaterial, eq(manufacturingRecipeMaterial.materialId, manufacturingMaterial.id))
        .where(and(
          eq(manufacturingRecipeMaterial.recipeId, recipe.id),
          eq(manufacturingMaterial.manufacturerId, manufacturerId),
        ));
      const usage = input.materialUsage ?? [];
      if (lines.length === 0 || lines.length !== usage.length
        || lines.some((line) => !usage.some((entry) => entry.materialId === line.materialId))) {
        return { ok: false as const, code: 'MATERIAL_USAGE_MISMATCH' as const };
      }
      recipeVersion = recipe.version;
      materialTolerancePercent = recipe.materialTolerancePercent;
      plannedMaterials = lines.map((line) => ({
        ...line,
        plannedQuantity: line.plannedQuantity * (input.plannedOutputQuantity ?? input.quantity) / recipe.batchOutputQuantity,
        actualQuantity: usage.find((entry) => entry.materialId === line.materialId)!.actualQuantity,
      }));
    }

    const [batch] = await tx.insert(productionBatch).values({
      manufacturerId,
      productId: input.productId,
      batchReference,
      declaredQuantity: input.quantity,
      plannedQuantity: input.plannedOutputQuantity ?? null,
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
        plannedQuantity: productionBatch.plannedQuantity,
        unitPrice: productionBatch.unitPrice,
        vatRateBasisPoints: productionBatch.vatRateBasisPoints,
      }).from(productionBatch)
        .where(and(
          eq(productionBatch.manufacturerId, manufacturerId),
          eq(productionBatch.idempotencyKey, input.idempotencyKey),
        )).limit(1);

      if (!existing || existing.productId !== input.productId || existing.quantity !== input.quantity
        || existing.plannedQuantity !== (input.plannedOutputQuantity ?? null) || existing.unitPrice !== input.unitPrice) {
        return { ok: false as const, code: 'DUPLICATE_REQUEST' as const };
      }
      const savedMaterials = await tx.select({
        recipeId: productionBatchMaterial.recipeId,
        materialId: productionBatchMaterial.materialId,
        actualQuantity: productionBatchMaterial.actualQuantity,
      }).from(productionBatchMaterial).where(eq(productionBatchMaterial.batchId, existing.id));
      const submittedMaterials = input.materialUsage ?? [];
      if ((input.recipeId ?? null) !== (savedMaterials[0]?.recipeId ?? null)
        || savedMaterials.length !== submittedMaterials.length
        || savedMaterials.some((saved) => !submittedMaterials.some((submitted) => submitted.materialId === saved.materialId && submitted.actualQuantity === saved.actualQuantity))) {
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

    if (plannedMaterials.length > 0) {
      await tx.insert(productionBatchMaterial).values(plannedMaterials.map((material) => ({
        batchId: batch.id,
        recipeId: input.recipeId!,
        recipeMaterialId: material.recipeMaterialId,
        materialId: material.materialId,
        plannedQuantity: material.plannedQuantity,
        actualQuantity: material.actualQuantity,
      })));

      const outOfTolerance = plannedMaterials.filter((material) => {
        const variancePercent = Math.abs(material.actualQuantity - material.plannedQuantity) / material.plannedQuantity * 100;
        return variancePercent > materialTolerancePercent;
      });
      const plannedOutput = input.plannedOutputQuantity;
      const outputVariance = plannedOutput
        ? Math.abs(input.quantity - plannedOutput) / plannedOutput * 100
        : 0;
      const findings = outOfTolerance.map((material) => {
          const difference = material.actualQuantity - material.plannedQuantity;
          const variancePercent = Math.abs(difference) / material.plannedQuantity * 100;
          return {
            findingType: 'production_discrepancy',
            severity: variancePercent > materialTolerancePercent * 2 ? 'warning' : 'info',
            businessId: manufacturerId,
            productId: input.productId,
            observedValue: material.actualQuantity,
            expectedValue: material.plannedQuantity,
            difference,
            differenceUnit: 'material_units',
            explanation: `Potential material usage discrepancy for protected material ${material.materialCode} (${variancePercent.toFixed(1)}% variance). Human review required; this signal is not a finding of wrongdoing.`,
            evidenceRefs: JSON.stringify({ batchId: batch.id, batchReference, recipeId: input.recipeId, recipeVersion, materialCode: material.materialCode }),
            detectionMethod: 'deterministic',
            reviewStatus: 'open',
            modelVersion: 'recipe-variance-v1',
          };
      });
      if (plannedOutput && outputVariance > materialTolerancePercent) {
        const difference = input.quantity - plannedOutput;
        findings.push({
          findingType: 'production_discrepancy',
          severity: outputVariance > materialTolerancePercent * 2 ? 'warning' : 'info',
          businessId: manufacturerId,
          productId: input.productId,
          observedValue: input.quantity,
          expectedValue: plannedOutput,
          difference,
          differenceUnit: 'units',
          explanation: `Potential production output discrepancy (${outputVariance.toFixed(1)}% variance). Human review required; this signal is not a finding of wrongdoing.`,
          evidenceRefs: JSON.stringify({ batchId: batch.id, batchReference, recipeId: input.recipeId, recipeVersion }),
          detectionMethod: 'deterministic',
          reviewStatus: 'open',
          modelVersion: 'recipe-variance-v1',
        });
      }
      if (findings.length > 0) await tx.insert(aiFinding).values(findings);
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

    const auditEvents = [
      'PRODUCTION_CREATED',
      'BATCH_CREATED',
      'INVENTORY_INCREASED',
      ...(plannedMaterials.length ? ['PRODUCTION_MATERIALS_RECORDED'] : []),
    ];
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
        plannedQuantity: input.plannedOutputQuantity ?? null,
        unitPrice: input.unitPrice,
        totalValue,
        vatRateBasisPoints,
        potentialTax,
        recipeId: input.recipeId ?? null,
        recipeVersion,
        materialLineCount: plannedMaterials.length,
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
