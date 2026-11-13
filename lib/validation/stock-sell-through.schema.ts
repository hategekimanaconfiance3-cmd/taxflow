import { z } from "zod";

const quantityString = z.string().trim()
  .regex(/^\d+(?:\.\d{1,6})?$/, "Enter a valid positive quantity.")
  .transform(Number)
  .refine((value) => Number.isFinite(value) && value > 0 && value <= 1_000_000_000, "Quantity must be greater than zero and within the supported limit.");

export const stockRestockRequestSchema = z.object({
  productId: z.string().trim().min(1).max(128),
  requestedQuantity: quantityString,
  idempotencyKey: z.string().uuid(),
  exceptionReason: z.string().trim().max(1000).optional(),
}).refine((value) => !value.exceptionReason || value.exceptionReason.length >= 10, {
  path: ["exceptionReason"],
  message: "Explain the exception request in at least 10 characters.",
});

export const stockSellThroughThresholdSchema = z.object({
  scopeType: z.enum(["default", "category", "product"]),
  scopeKey: z.string().trim().min(1).max(128),
  thresholdPercent: z.string().trim()
    .regex(/^\d+(?:\.\d{1,2})?$/, "Enter a percentage from 0 to 100.")
    .transform(Number)
    .refine((value) => Number.isFinite(value) && value >= 0 && value <= 100, "Percentage must be between 0 and 100."),
  effectiveAt: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  reason: z.string().trim().min(8).max(1000),
});

export const stockRestockExceptionReviewSchema = z.object({
  requestId: z.string().trim().min(1).max(128),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().min(8).max(1000),
});

export const stockSellThroughBaselineAttestationSchema = z.object({
  businessId: z.string().trim().min(1).max(128),
  productId: z.string().trim().min(1).max(128),
  reason: z.string().trim().min(10).max(1000),
});
