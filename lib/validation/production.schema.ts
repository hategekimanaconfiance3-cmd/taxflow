import { z } from 'zod';

const productionQuantity = z.number().finite().min(0).max(1_000_000_000)
  .refine((value) => Number.isSafeInteger(Math.round(value * 1_000_000))
    && Math.abs(value - Math.round(value * 1_000_000) / 1_000_000) < 1e-9,
  'Use no more than 6 decimal places.');

export const productRegistrationSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required').max(160),
  unit: z.enum(['kg', 'unit', 'liter', 'box', 'pack', 'ton']),
  categoryCode: z.string().trim().max(64).optional().default(''),
});

export const productionEntrySchema = z.object({
  productId: z.string().trim().min(1).max(128),
  quantity: z.number().finite().positive().max(1_000_000_000),
  unitPrice: z.number().int().min(0).max(100_000_000),
  idempotencyKey: z.string().uuid(),
  materialPlanId: z.string().trim().min(1).max(128).optional(),
  recipeVersionId: z.string().trim().min(1).max(128).optional(),
  plannedOutputQuantity: productionQuantity.positive().optional(),
  goodOutputQuantity: productionQuantity.optional(),
  rejectedOutputQuantity: productionQuantity.optional(),
  notes: z.string().trim().max(2_000).optional(),
  actualMaterials: z.array(z.object({
    recipeMaterialId: z.string().trim().min(1).max(128),
    actualQuantity: productionQuantity,
    wasteQuantity: productionQuantity.default(0),
  }).strict()).max(100).optional(),
}).refine((entry) => Number.isSafeInteger(Math.round(entry.quantity * entry.unitPrice)), {
  message: 'Production value is outside the supported range',
  path: ['quantity'],
}).refine((entry) => entry.recipeVersionId
  ? (entry.actualMaterials?.length ?? 0) > 0 && entry.plannedOutputQuantity !== undefined
    && entry.goodOutputQuantity !== undefined && entry.rejectedOutputQuantity !== undefined
    && entry.materialPlanId !== undefined
  : !entry.actualMaterials?.length && entry.plannedOutputQuantity === undefined
    && entry.goodOutputQuantity === undefined && entry.rejectedOutputQuantity === undefined
    && entry.materialPlanId === undefined, {
  message: 'Select a recipe and reserved material plan, then record planned output, actual materials, good output, and rejects together.',
  path: ['actualMaterials'],
}).refine((entry) => !(entry.actualMaterials ?? []).some((item) => item.actualQuantity === 0)
  || Boolean(entry.notes?.trim()), {
  message: 'Add a production note explaining any recipe material reported with zero consumption.',
  path: ['notes'],
}).refine((entry) => new Set(entry.actualMaterials?.map((item) => item.recipeMaterialId)).size === (entry.actualMaterials?.length ?? 0), {
  message: 'A recipe material can only be entered once.',
  path: ['actualMaterials'],
}).refine((entry) => !entry.materialPlanId || Boolean(entry.recipeVersionId), {
  message: 'A material plan must be completed with its recipe evidence.',
  path: ['materialPlanId'],
}).refine((entry) => entry.goodOutputQuantity === undefined || entry.rejectedOutputQuantity === undefined
  || Math.round(entry.goodOutputQuantity * 1_000_000) + Math.round(entry.rejectedOutputQuantity * 1_000_000) === Math.round(entry.quantity * 1_000_000), {
  message: 'Verified good output plus rejected output must equal total actual output.',
  path: ['goodOutputQuantity'],
}).refine((entry) => (entry.actualMaterials ?? []).every((item) => Math.round(item.wasteQuantity * 1_000_000) <= Math.round(item.actualQuantity * 1_000_000)), {
  message: 'Recorded material waste cannot exceed actual material consumption.',
  path: ['actualMaterials'],
}).strict();

const accountingQuantity = z.number().finite().positive().max(1_000_000_000)
  .refine((value) => Number.isSafeInteger(Math.round(value * 1_000_000))
    && Math.abs(value - Math.round(value * 1_000_000) / 1_000_000) < 1e-9, 'Use no more than 6 decimal places.');

export const productionMaterialPlanSchema = z.object({
  productId: z.string().trim().min(1).max(128),
  recipeVersionId: z.string().trim().min(1).max(128),
  plannedOutputQuantity: accountingQuantity,
  idempotencyKey: z.string().uuid(),
});

export const productionMaterialPlanCancelSchema = z.object({
  planId: z.string().trim().min(1).max(128),
  note: z.string().trim().min(5).max(1_000),
}).strict();

export const productionBatchTraceabilityQuerySchema = z.object({
  batchId: z.string().uuid(),
}).strict();

export const productionMaterialReceiptSchema = z.object({
  materialId: z.string().trim().min(1).max(128),
  origin: z.enum(['import', 'domestic', 'opening_balance']),
  importDeclarationId: z.string().trim().min(1).max(128).optional(),
  transactionId: z.string().trim().min(1).max(128).optional(),
  supplierReference: z.string().trim().max(160).optional(),
  evidenceReference: z.string().trim().min(2).max(500),
  lotReference: z.string().trim().max(160).optional(),
  quantity: accountingQuantity,
  idempotencyKey: z.string().uuid(),
}).superRefine((value, context) => {
  if (value.origin === 'import' && (!value.importDeclarationId || value.transactionId)) {
    context.addIssue({ code: 'custom', message: 'Select one activated import declaration for an imported material receipt.', path: ['importDeclarationId'] });
  }
  if (value.origin === 'domestic' && (!value.transactionId || value.importDeclarationId)) {
    context.addIssue({ code: 'custom', message: 'Select one confirmed incoming transaction for a domestic material receipt.', path: ['transactionId'] });
  }
  if (value.origin === 'opening_balance' && (value.importDeclarationId || value.transactionId)) {
    context.addIssue({ code: 'custom', message: 'Opening balance evidence cannot reference an import or transaction.', path: ['origin'] });
  }
});

export const productionMaterialReceiptReviewSchema = z.object({
  receiptId: z.string().trim().min(1).max(128),
  decision: z.enum(['verify', 'reject']),
  note: z.string().trim().min(5).max(1_000),
});

export const productionBatchMaterialReviewSchema = z.object({
  batchId: z.string().trim().min(1).max(128),
  decision: z.enum(['release', 'reject']),
  note: z.string().trim().min(5).max(1_000),
  goodOutputQuantity: z.number().finite().min(0).max(1_000_000_000).optional(),
  rejectedOutputQuantity: z.number().finite().min(0).max(1_000_000_000).optional(),
  outputEvidenceReference: z.string().trim().min(2).max(500).optional(),
}).strict().superRefine((value, context) => {
  const hasGood = value.goodOutputQuantity !== undefined;
  const hasRejected = value.rejectedOutputQuantity !== undefined;
  if (hasGood !== hasRejected) context.addIssue({ code: 'custom', message: 'Enter both good and rejected quantities together.', path: ['goodOutputQuantity'] });
  if (value.decision === 'release' && (!hasGood || !hasRejected || !value.outputEvidenceReference)) {
    context.addIssue({ code: 'custom', message: 'A release requires independently verified good and rejected quantities and an evidence reference.', path: ['outputEvidenceReference'] });
  }
  if (value.decision === 'reject' && (hasGood || hasRejected || value.outputEvidenceReference)) {
    context.addIssue({ code: 'custom', message: 'Output evidence can only be recorded with a release decision.', path: ['decision'] });
  }
});

export const productionMaterialAdjustmentSchema = z.object({
  materialId: z.string().trim().min(1).max(128),
  quantityDelta: z.number().finite().refine((value) => value !== 0 && Number.isSafeInteger(Math.round(value * 1_000_000)), 'Use a non-zero quantity with at most 6 decimal places.'),
  evidenceReference: z.string().trim().min(2).max(500),
  reason: z.string().trim().min(5).max(1_000),
});

const recipeMaterialInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  unit: z.string().trim().min(1).max(32),
  quantity: z.number().finite().positive().max(1_000_000_000)
    .refine((value) => Number.isSafeInteger(Math.round(value * 1_000_000))
      && Math.abs(value - Math.round(value * 1_000_000) / 1_000_000) < 1e-9, 'Use no more than 6 decimal places.'),
}).strict();

export const productionRecipeSchema = z.object({
  productId: z.string().trim().min(1).max(128),
  outputQuantity: z.number().finite().positive().max(1_000_000_000),
  materials: z.array(recipeMaterialInputSchema).min(1).max(100),
}).refine((recipe) => {
  const keys = recipe.materials.map((material) => material.name.toLocaleLowerCase());
  return new Set(keys).size === keys.length;
}, { message: 'Material names must be unique within a recipe version.', path: ['materials'] }).strict();

export const productionToleranceStandardCreateSchema = z.object({
  recipeVersionId: z.string().trim().min(1).max(128),
  toleranceType: z.enum(['yield', 'material_consumption']),
  materialId: z.string().trim().min(1).max(128).optional(),
  toleranceBasisPoints: z.number().int().min(0).max(10_000),
  toleranceUnit: z.literal('basis_points'),
  effectiveAt: z.string().datetime(),
  justification: z.string().trim().min(10).max(2_000),
  evidenceReference: z.string().trim().min(2).max(500),
}).strict().superRefine((value, context) => {
  if (value.toleranceType === 'yield' && value.materialId) {
    context.addIssue({ code: 'custom', message: 'Yield standards apply to a recipe and cannot target a material.', path: ['materialId'] });
  }
  if (value.toleranceType === 'material_consumption' && !value.materialId) {
    context.addIssue({ code: 'custom', message: 'Select a material for a material-consumption standard.', path: ['materialId'] });
  }
});

export const productionToleranceStandardDecisionSchema = z.object({
  action: z.enum(['approve', 'activate', 'deactivate']),
  note: z.string().trim().min(5).max(1_000),
}).strict();

export const productionFormulaAccessSchema = z.object({
  batchId: z.string().trim().min(1).max(128),
  reason: z.enum(['investigation_case', 'production_discrepancy', 'regulatory_review']),
  caseReference: z.string().trim().min(1).max(128).optional(),
}).refine((request) => request.reason !== 'investigation_case' || Boolean(request.caseReference), {
  message: 'A case reference is required for investigation access.',
  path: ['caseReference'],
});

export type ProductRegistrationInput = z.infer<typeof productRegistrationSchema>;
export type ProductionEntryInput = z.infer<typeof productionEntrySchema>;
