import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import db from '@/db/drizzle';
import {
  auditLog,
  product,
  productionMaterial,
  productionRecipe,
  productionRecipeMaterial,
  productionToleranceStandard,
  rraStaff,
  rraStaffRole,
  user,
} from '@/db/schema';
import { hasRRAPermission } from '@/lib/rra-rbac';
import type {
  productionToleranceStandardCreateSchema,
  productionToleranceStandardDecisionSchema,
} from '@/lib/validation/production.schema';
import type { z } from 'zod';

type ToleranceInput = z.infer<typeof productionToleranceStandardCreateSchema>;
type ToleranceDecision = z.infer<typeof productionToleranceStandardDecisionSchema>;

export class ProductionToleranceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ProductionToleranceError';
  }
}

async function assertToleranceGovernor(actorUserId: string): Promise<void> {
  const [staff] = await db.select({ id: rraStaff.id, active: rraStaff.isActive, clearance: rraStaff.clearanceLevel })
    .from(rraStaff)
    .innerJoin(user, eq(rraStaff.userId, user.id))
    .where(and(eq(rraStaff.userId, actorUserId), eq(user.isActive, true)))
    .limit(1);
  if (!staff?.active) throw new ProductionToleranceError('FORBIDDEN', 'Super Admin authorization is required.');

  const assignedRows = await db.select({ role: rraStaffRole.role })
    .from(rraStaffRole)
    .where(eq(rraStaffRole.staffRecordId, staff.id));
  const roles = assignedRows.length ? assignedRows.map((row) => row.role) : [staff.clearance];
  if (!roles.includes('super_admin') || !hasRRAPermission('super_admin', 'production.tolerance.govern')) {
    throw new ProductionToleranceError('FORBIDDEN', 'Super Admin authorization is required.');
  }
}

export async function listProductionToleranceGovernance(actorUserId: string) {
  await assertToleranceGovernor(actorUserId);
  const recipes = await db.select({
    manufacturerId: productionRecipe.manufacturerId,
    manufacturerName: user.businessName,
    manufacturerAccountName: user.name,
    productId: product.id,
    productName: product.name,
    recipeVersionId: productionRecipe.id,
    recipeCode: productionRecipe.recipeCode,
    recipeVersion: productionRecipe.version,
    outputQuantity: productionRecipe.outputQuantity,
  }).from(productionRecipe)
    .innerJoin(product, eq(productionRecipe.productId, product.id))
    .innerJoin(user, eq(productionRecipe.manufacturerId, user.id))
    .where(eq(product.createdByUserId, productionRecipe.manufacturerId))
    .orderBy(desc(productionRecipe.createdAt))
    .limit(500);

  const recipeIds = recipes.map((recipe) => recipe.recipeVersionId);
  const materialRows = recipeIds.length ? await db.select({
    recipeVersionId: productionRecipeMaterial.recipeVersionId,
    materialId: productionMaterial.id,
    materialCode: productionMaterial.materialCode,
    unit: productionMaterial.unit,
  }).from(productionRecipeMaterial)
    .innerJoin(productionRecipe, eq(productionRecipeMaterial.recipeVersionId, productionRecipe.id))
    .innerJoin(productionMaterial, and(
      eq(productionRecipeMaterial.materialId, productionMaterial.id),
      eq(productionMaterial.manufacturerId, productionRecipe.manufacturerId),
    ))
    .where(and(
      // Recipe ids are bounded to the ownership-scoped options above.
      inArray(productionRecipeMaterial.recipeVersionId, recipeIds),
    )) : [];
  const materialsByRecipe = new Map<string, typeof materialRows>();
  for (const row of materialRows) materialsByRecipe.set(row.recipeVersionId, [...(materialsByRecipe.get(row.recipeVersionId) ?? []), row]);

  const standards = await db.select({
    id: productionToleranceStandard.id,
    manufacturerId: productionToleranceStandard.manufacturerId,
    productId: productionToleranceStandard.productId,
    productName: product.name,
    recipeVersionId: productionToleranceStandard.recipeVersionId,
    recipeCode: productionRecipe.recipeCode,
    recipeVersion: productionRecipe.version,
    materialId: productionToleranceStandard.materialId,
    materialCode: productionMaterial.materialCode,
    materialUnit: productionMaterial.unit,
    toleranceType: productionToleranceStandard.toleranceType,
    version: productionToleranceStandard.version,
    toleranceBasisPoints: productionToleranceStandard.toleranceBasisPoints,
    toleranceUnit: productionToleranceStandard.toleranceUnit,
    effectiveAt: productionToleranceStandard.effectiveAt,
    status: productionToleranceStandard.status,
    justification: productionToleranceStandard.justification,
    evidenceReference: productionToleranceStandard.evidenceReference,
    createdByUserId: productionToleranceStandard.createdByUserId,
    createdAt: productionToleranceStandard.createdAt,
    approvedByUserId: productionToleranceStandard.approvedByUserId,
    approvedAt: productionToleranceStandard.approvedAt,
    approvalNote: productionToleranceStandard.approvalNote,
    activatedByUserId: productionToleranceStandard.activatedByUserId,
    activatedAt: productionToleranceStandard.activatedAt,
    activationNote: productionToleranceStandard.activationNote,
    deactivatedByUserId: productionToleranceStandard.deactivatedByUserId,
    deactivatedAt: productionToleranceStandard.deactivatedAt,
    deactivationNote: productionToleranceStandard.deactivationNote,
  }).from(productionToleranceStandard)
    .innerJoin(product, eq(productionToleranceStandard.productId, product.id))
    .innerJoin(productionRecipe, eq(productionToleranceStandard.recipeVersionId, productionRecipe.id))
    .leftJoin(productionMaterial, eq(productionToleranceStandard.materialId, productionMaterial.id))
    .orderBy(desc(productionToleranceStandard.createdAt))
    .limit(1000);

  return {
    recipes: recipes.map((recipe) => ({
      ...recipe,
      manufacturerName: recipe.manufacturerName ?? recipe.manufacturerAccountName,
      materials: materialsByRecipe.get(recipe.recipeVersionId) ?? [],
    })),
    standards,
  };
}

export async function createProductionToleranceDraft(actorUserId: string, input: ToleranceInput) {
  await assertToleranceGovernor(actorUserId);
  return db.transaction(async (tx) => {
    const [recipe] = await tx.select({
      id: productionRecipe.id,
      manufacturerId: productionRecipe.manufacturerId,
      productId: productionRecipe.productId,
    }).from(productionRecipe)
      .where(eq(productionRecipe.id, input.recipeVersionId))
      .for('update')
      .limit(1);
    if (!recipe) throw new ProductionToleranceError('RECIPE_NOT_FOUND', 'Select an existing production recipe version.');

    if (input.materialId) {
      const [line] = await tx.select({ materialId: productionRecipeMaterial.materialId })
        .from(productionRecipeMaterial)
        .innerJoin(productionMaterial, eq(productionRecipeMaterial.materialId, productionMaterial.id))
        .where(and(
          eq(productionRecipeMaterial.recipeVersionId, recipe.id),
          eq(productionRecipeMaterial.materialId, input.materialId),
          eq(productionMaterial.manufacturerId, recipe.manufacturerId),
        ))
        .limit(1);
      if (!line) throw new ProductionToleranceError('MATERIAL_NOT_IN_RECIPE', 'Select a material that belongs to the recipe version.');
    }

    const scopeConditions = [
      eq(productionToleranceStandard.manufacturerId, recipe.manufacturerId),
      eq(productionToleranceStandard.productId, recipe.productId),
      eq(productionToleranceStandard.recipeVersionId, recipe.id),
      eq(productionToleranceStandard.toleranceType, input.toleranceType),
      input.materialId
        ? eq(productionToleranceStandard.materialId, input.materialId)
        : isNull(productionToleranceStandard.materialId),
    ];
    const [latest] = await tx.select({ version: productionToleranceStandard.version })
      .from(productionToleranceStandard)
      .where(and(...scopeConditions))
      .orderBy(desc(productionToleranceStandard.version))
      .limit(1);
    const version = (latest?.version ?? 0) + 1;
    const id = randomUUID();
    const effectiveAt = new Date(input.effectiveAt);
    if (!Number.isFinite(effectiveAt.getTime())) throw new ProductionToleranceError('INVALID_EFFECTIVE_DATE', 'Enter a valid effective date.');

    await tx.insert(productionToleranceStandard).values({
      id,
      manufacturerId: recipe.manufacturerId,
      productId: recipe.productId,
      recipeVersionId: recipe.id,
      materialId: input.materialId ?? null,
      toleranceType: input.toleranceType,
      version,
      toleranceBasisPoints: input.toleranceBasisPoints,
      toleranceUnit: input.toleranceUnit,
      effectiveAt,
      status: 'draft',
      justification: input.justification,
      evidenceReference: input.evidenceReference,
      createdByUserId: actorUserId,
    });
    await tx.insert(auditLog).values({
      userId: actorUserId,
      action: 'PRODUCTION_TOLERANCE_VERSION_CREATED',
      targetType: 'production_tolerance_standard',
      targetId: id,
      metadata: JSON.stringify({ recipeVersionId: recipe.id, productId: recipe.productId, materialId: input.materialId ?? null, toleranceType: input.toleranceType, version, toleranceBasisPoints: input.toleranceBasisPoints, effectiveAt: effectiveAt.toISOString(), evidenceReference: input.evidenceReference }),
    });
    return { id, version, status: 'draft' as const };
  });
}

export async function transitionProductionTolerance(actorUserId: string, standardId: string, input: ToleranceDecision) {
  await assertToleranceGovernor(actorUserId);
  return db.transaction(async (tx) => {
    const [standard] = await tx.select().from(productionToleranceStandard)
      .where(eq(productionToleranceStandard.id, standardId))
      .for('update')
      .limit(1);
    if (!standard) throw new ProductionToleranceError('NOT_FOUND', 'Tolerance version was not found.');

    const now = new Date();
    const transition = input.action === 'approve' && standard.status === 'draft'
      ? { status: 'approved' as const, approvedByUserId: actorUserId, approvedAt: now, approvalNote: input.note }
      : input.action === 'activate' && standard.status === 'approved'
        ? { status: 'active' as const, activatedByUserId: actorUserId, activatedAt: now, activationNote: input.note }
        : input.action === 'deactivate' && standard.status === 'active'
          ? { status: 'inactive' as const, deactivatedByUserId: actorUserId, deactivatedAt: now, deactivationNote: input.note }
          : null;
    if (!transition) throw new ProductionToleranceError('INVALID_TRANSITION', 'This tolerance version cannot take that action from its current status.');

    const [updated] = await tx.update(productionToleranceStandard).set(transition)
      .where(and(eq(productionToleranceStandard.id, standardId), eq(productionToleranceStandard.status, standard.status)))
      .returning({ id: productionToleranceStandard.id, status: productionToleranceStandard.status });
    if (!updated) throw new ProductionToleranceError('CONCURRENT_UPDATE', 'Tolerance status changed concurrently; refresh and retry.');
    await tx.insert(auditLog).values({
      userId: actorUserId,
      action: `PRODUCTION_TOLERANCE_VERSION_${input.action.toUpperCase()}D`,
      targetType: 'production_tolerance_standard',
      targetId: standardId,
      beforeState: { status: standard.status },
      afterState: { status: updated.status },
      metadata: JSON.stringify({ version: standard.version, toleranceType: standard.toleranceType, productId: standard.productId, recipeVersionId: standard.recipeVersionId, materialId: standard.materialId, note: input.note }),
    });
    return { id: updated.id, status: updated.status };
  });
}
