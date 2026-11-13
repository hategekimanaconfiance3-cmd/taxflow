import { z } from 'zod';

const quantitySchema = z.number().finite().positive().max(1_000_000_000);
const nonNegativeQuantitySchema = z.number().finite().nonnegative().max(1_000_000_000);

export const representativeInviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
});

export const representativeIdSchema = z.object({
  representativeId: z.uuid(),
});

export const fulfillmentIdSchema = z.object({
  transactionId: z.uuid(),
});

export const dispatchInputSchema = fulfillmentIdSchema.extend({
  quantity: quantitySchema,
  idempotencyKey: z.uuid(),
  dispatchReference: z.string().trim().max(120).optional(),
});

export const receiptInputSchema = z.object({
  dispatchId: z.uuid(),
  quantityReceived: quantitySchema,
  acceptedQuantity: nonNegativeQuantitySchema,
  damagedQuantity: nonNegativeQuantitySchema.default(0),
  rejectedQuantity: nonNegativeQuantitySchema.default(0),
  disputedQuantity: nonNegativeQuantitySchema.default(0),
  idempotencyKey: z.uuid(),
  notes: z.string().trim().max(2000).optional(),
}).superRefine((value, context) => {
  const classified = value.acceptedQuantity + value.damagedQuantity + value.rejectedQuantity + value.disputedQuantity;
  if (Math.abs(classified - value.quantityReceived) >= 0.000001) {
    context.addIssue({ code: 'custom', path: ['quantityReceived'], message: 'Accepted, damaged, rejected, and disputed quantities must equal the measured receipt quantity.' });
  }
});

export type DispatchInput = z.infer<typeof dispatchInputSchema>;
export type ReceiptInput = z.infer<typeof receiptInputSchema>;
