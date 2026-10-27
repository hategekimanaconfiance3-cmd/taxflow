import { z } from 'zod';

export const productRegistrationSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required').max(160),
  unit: z.enum(['kg', 'unit', 'liter', 'box', 'pack', 'ton']),
  categoryCode: z.string().trim().max(64).optional().default(''),
});

export const productionEntrySchema = z.object({
  productId: z.string().trim().min(1).max(128),
  quantity: z.number().finite().positive().max(1_000_000_000),
  plannedOutputQuantity: z.number().finite().positive().max(1_000_000_000).optional(),
  unitPrice: z.number().int().min(0).max(100_000_000),
  idempotencyKey: z.string().uuid(),
  recipeId: z.string().trim().min(1).max(128).optional(),
  materialUsage: z.array(z.object({
    materialId: z.string().trim().min(1).max(128),
    actualQuantity: z.number().finite().nonnegative().max(1_000_000_000),
  })).min(1).optional(),
}).superRefine((entry, context) => {
  if (!Number.isSafeInteger(Math.round(entry.quantity * entry.unitPrice))) {
    context.addIssue({ code: 'custom', message: 'Production value is outside the supported range', path: ['quantity'] });
  }
  if (Boolean(entry.recipeId) !== Boolean(entry.materialUsage?.length)) {
    context.addIssue({ code: 'custom', message: 'Select a recipe and provide actual material usage together.', path: ['materialUsage'] });
  }
  if (entry.recipeId && !entry.plannedOutputQuantity) {
    context.addIssue({ code: 'custom', message: 'Enter the planned output quantity when recording recipe materials.', path: ['plannedOutputQuantity'] });
  }
  const materialIds = entry.materialUsage?.map((item) => item.materialId) ?? [];
  if (new Set(materialIds).size !== materialIds.length) {
    context.addIssue({ code: 'custom', message: 'Each material can only be entered once.', path: ['materialUsage'] });
  }
});

export const manufacturingMaterialSchema = z.object({
  name: z.string().trim().min(1).max(160),
  unit: z.string().trim().min(1).max(32),
});

export const manufacturingRecipeSchema = z.object({
  productId: z.string().trim().min(1).max(128),
  batchOutputQuantity: z.number().finite().positive().max(1_000_000_000),
  materialTolerancePercent: z.number().finite().min(0).max(100).default(5),
  materials: z.array(z.object({
    materialId: z.string().trim().min(1).max(128),
    plannedQuantity: z.number().finite().positive().max(1_000_000_000),
  })).min(1).max(100),
}).superRefine((recipe, context) => {
  const ids = recipe.materials.map((material) => material.materialId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: 'custom', message: 'Each material can only appear once in a recipe.', path: ['materials'] });
  }
});

export type ProductRegistrationInput = z.infer<typeof productRegistrationSchema>;
export type ProductionEntryInput = z.infer<typeof productionEntrySchema>;
export type ManufacturingMaterialInput = z.infer<typeof manufacturingMaterialSchema>;
export type ManufacturingRecipeInput = z.infer<typeof manufacturingRecipeSchema>;
