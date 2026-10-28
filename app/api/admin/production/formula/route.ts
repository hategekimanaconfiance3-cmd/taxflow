import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import db from '@/db/drizzle';
import { auditLog, product, productionBatch, productionBatchMaterialUsage, productionMaterial, productionRecipe, productionRecipeMaterial, rraCase, user } from '@/db/schema';
import { requireRRAPermission } from '@/lib/auth-guard';
import { productionFormulaAccessSchema } from '@/lib/validation/production.schema';

function json(body: unknown, status: number, requestId: string): NextResponse {
  return NextResponse.json(body, { status, headers: { 'x-request-id': requestId } });
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const access = await requireRRAPermission('production.formula.read');
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Enter a valid formula access request.' }, 400, requestId);
    }
    const parsed = productionFormulaAccessSchema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Enter a valid formula access request.' }, 400, requestId);
    const { batchId, reason, caseReference } = parsed.data;

    if (reason === 'investigation_case') {
      const [assignedCase] = await db.select({ id: rraCase.id })
        .from(rraCase)
        .where(and(eq(rraCase.id, caseReference ?? ''), eq(rraCase.assignedStaffId, access.staff.id)))
        .limit(1);
      if (!assignedCase) {
        await db.insert(auditLog).values({
          userId: access.user.id,
          action: 'CONFIDENTIAL_FORMULA_ACCESS_DENIED',
          targetType: 'production_batch',
          targetId: batchId,
          metadata: JSON.stringify({ reason, caseReference, outcome: 'case_not_assigned' }),
        });
        return json({ error: 'Formula access requires a case assigned to your account.' }, 403, requestId);
      }
    }

    const formula = await db.transaction(async (tx) => {
      const [batch] = await tx.select({
        id: productionBatch.id,
        manufacturerId: productionBatch.manufacturerId,
        manufacturerName: user.businessName,
        batchReference: productionBatch.batchReference,
        productName: product.name,
        outputQuantity: productionBatch.declaredQuantity,
        plannedOutputQuantity: productionBatch.plannedOutputQuantity,
        productionValidationStatus: productionBatch.productionValidationStatus,
        recipeVersionId: productionBatch.recipeVersionId,
        recipeCode: productionRecipe.recipeCode,
        recipeVersion: productionRecipe.version,
        recipeOutputQuantity: productionRecipe.outputQuantity,
        yieldToleranceBasisPoints: productionRecipe.yieldToleranceBasisPoints,
      }).from(productionBatch)
        .innerJoin(user, eq(productionBatch.manufacturerId, user.id))
        .innerJoin(product, eq(productionBatch.productId, product.id))
        .leftJoin(productionRecipe, eq(productionBatch.recipeVersionId, productionRecipe.id))
        .where(eq(productionBatch.id, batchId))
        .limit(1);

      await tx.insert(auditLog).values({
        userId: access.user.id,
        action: batch?.recipeVersionId ? 'CONFIDENTIAL_FORMULA_ACCESSED' : 'CONFIDENTIAL_FORMULA_ACCESS_EMPTY',
        targetType: 'production_batch',
        targetId: batchId,
        metadata: JSON.stringify({
          reason,
          caseReference: caseReference ?? null,
          manufacturerId: batch?.manufacturerId ?? null,
          recipeVersionId: batch?.recipeVersionId ?? null,
          materialCount: batch?.recipeVersionId
            ? await tx.select({ id: productionRecipeMaterial.id }).from(productionRecipeMaterial)
              .where(eq(productionRecipeMaterial.recipeVersionId, batch.recipeVersionId)).then((rows) => rows.length)
            : 0,
        }),
      });

      if (!batch?.recipeVersionId) return null;
      const materials = await tx.select({
        materialCode: productionMaterial.materialCode,
        materialName: productionMaterial.confidentialName,
        unit: productionMaterial.unit,
        recipeQuantity: productionRecipeMaterial.quantity,
        plannedQuantity: productionBatchMaterialUsage.plannedQuantity,
        actualQuantity: productionBatchMaterialUsage.actualQuantity,
      }).from(productionRecipeMaterial)
        .innerJoin(productionMaterial, eq(productionRecipeMaterial.materialId, productionMaterial.id))
        .leftJoin(productionBatchMaterialUsage, and(
          eq(productionBatchMaterialUsage.recipeMaterialId, productionRecipeMaterial.id),
          eq(productionBatchMaterialUsage.productionBatchId, batchId),
        ))
        .where(eq(productionRecipeMaterial.recipeVersionId, batch.recipeVersionId));

      return {
        batchReference: batch.batchReference,
        manufacturerName: batch.manufacturerName,
        productName: batch.productName,
        outputQuantity: batch.outputQuantity,
        plannedOutputQuantity: batch.plannedOutputQuantity,
        productionValidationStatus: batch.productionValidationStatus,
        recipe: {
          code: batch.recipeCode,
          version: batch.recipeVersion,
          outputQuantity: batch.recipeOutputQuantity,
          yieldToleranceBasisPoints: batch.yieldToleranceBasisPoints,
        },
        materials,
      };
    });

    if (!formula) return json({ error: 'No recipe evidence is linked to this production batch.' }, 404, requestId);
    return json({ formula }, 200, requestId);
  } catch (error) {
    console.error('[production-formula:read]', {
      requestId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorCode: typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined,
    });
    return json({ error: 'Unable to retrieve the authorized formula evidence.', requestId }, 500, requestId);
  }
}
