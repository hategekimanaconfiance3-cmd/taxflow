import { z } from 'zod';

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
  recipeVersionId: z.string().trim().min(1).max(128).optional(),
  plannedOutputQuantity: z.number().finite().positive().max(1_000_000_000).optional(),
  actualMaterials: z.array(z.object({
    recipeMaterialId: z.string().trim().min(1).max(128),
    actualQuantity: z.number().finite().min(0).max(1_000_000_000),
  })).max(100).optional(),
}).refine((entry) => Number.isSafeInteger(Math.round(entry.quantity * entry.unitPrice)), {
  message: 'Production value is outside the supported range',
  path: ['quantity'],
}).refine((entry) => entry.recipeVersionId
  ? (entry.actualMaterials?.length ?? 0) > 0 && entry.plannedOutputQuantity !== undefined
  : !entry.actualMaterials?.length && entry.plannedOutputQuantity === undefined, {
  message: 'Select a recipe, enter a planned output, and record actual material quantities together.',
  path: ['actualMaterials'],
}).refine((entry) => new Set(entry.actualMaterials?.map((item) => item.recipeMaterialId)).size === (entry.actualMaterials?.length ?? 0), {
  message: 'A recipe material can only be entered once.',
  path: ['actualMaterials'],
});

const recipeMaterialInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  unit: z.string().trim().min(1).max(32),
  quantity: z.number().finite().positive().max(1_000_000_000),
});

export const productionRecipeSchema = z.object({
  productId: z.string().trim().min(1).max(128),
  outputQuantity: z.number().finite().positive().max(1_000_000_000),
  yieldToleranceBasisPoints: z.number().int().min(0).max(10_000),
  materials: z.array(recipeMaterialInputSchema).min(1).max(100),
}).refine((recipe) => {
  const keys = recipe.materials.map((material) => material.name.toLocaleLowerCase());
  return new Set(keys).size === keys.length;
}, { message: 'Material names must be unique within a recipe version.', path: ['materials'] });

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
