import { z } from 'zod';

const idempotencyKey = z.uuid();
const evidenceReference = z.string().trim().min(2).max(240);
const businessReason = z.string().trim().min(5).max(1000);
const positiveQuantity = z.number().finite().positive().max(1_000_000_000)
  .refine((value) => Number.isSafeInteger(value * 1_000_000), 'Quantity supports at most six decimal places.');

export const finishedGoodsWarehouseSchema = z.object({
  code: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(2).max(120),
});

export const finishedGoodsAllocationSchema = z.object({
  transactionId: z.uuid(),
  lotId: z.uuid(),
  quantity: positiveQuantity,
  idempotencyKey,
});

export const finishedGoodsAllocationCancelSchema = z.object({
  allocationId: z.uuid(),
  reason: businessReason,
});

export const finishedGoodsDispatchSchema = z.object({
  transactionId: z.uuid(),
  allocationId: z.uuid(),
  warehouseId: z.uuid(),
  quantity: positiveQuantity,
  idempotencyKey: z.uuid(),
  dispatchReference: z.string().trim().min(2).max(120),
});

export const finishedGoodsTransferSchema = z.object({
  lotId: z.uuid(),
  sourceWarehouseId: z.uuid(),
  destinationWarehouseId: z.uuid(),
  quantity: positiveQuantity,
  reference: z.string().trim().min(2).max(120),
  reason: businessReason,
  evidenceReference,
  idempotencyKey,
}).refine((value) => value.sourceWarehouseId !== value.destinationWarehouseId, {
  path: ['destinationWarehouseId'], message: 'Choose a different destination warehouse.',
});

export const finishedGoodsReturnSchema = z.object({
  lotId: z.uuid(),
  transactionId: z.uuid(),
  returnReference: z.string().trim().min(2).max(120),
  quantity: positiveQuantity,
  reason: businessReason,
  evidenceReference,
  idempotencyKey,
});

export const finishedGoodsReturnInspectionSchema = z.object({
  returnId: z.uuid(),
  warehouseId: z.uuid(),
  decision: z.enum(['accepted', 'rejected', 'partial']),
  acceptedQuantity: z.number().finite().nonnegative().max(1_000_000_000),
  rejectedQuantity: z.number().finite().nonnegative().max(1_000_000_000),
  reason: businessReason,
  evidenceReference,
}).superRefine((value, context) => {
  if (!Number.isSafeInteger(value.acceptedQuantity * 1_000_000)
    || !Number.isSafeInteger(value.rejectedQuantity * 1_000_000)) {
    context.addIssue({ code: 'custom', path: ['acceptedQuantity'], message: 'Quantities support at most six decimal places.' });
  }
  if (value.decision === 'accepted' && value.rejectedQuantity !== 0) {
    context.addIssue({ code: 'custom', path: ['rejectedQuantity'], message: 'An accepted inspection cannot include rejected quantity.' });
  }
  if (value.decision === 'rejected' && value.acceptedQuantity !== 0) {
    context.addIssue({ code: 'custom', path: ['acceptedQuantity'], message: 'A rejected inspection cannot include accepted quantity.' });
  }
  if (value.decision === 'partial' && (value.acceptedQuantity <= 0 || value.rejectedQuantity <= 0)) {
    context.addIssue({ code: 'custom', path: ['decision'], message: 'A partial inspection must record both accepted and rejected quantities.' });
  }
});
