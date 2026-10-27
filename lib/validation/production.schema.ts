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
}).refine((entry) => Number.isSafeInteger(Math.round(entry.quantity * entry.unitPrice)), {
  message: 'Production value is outside the supported range',
  path: ['quantity'],
});

export type ProductRegistrationInput = z.infer<typeof productRegistrationSchema>;
export type ProductionEntryInput = z.infer<typeof productionEntrySchema>;
