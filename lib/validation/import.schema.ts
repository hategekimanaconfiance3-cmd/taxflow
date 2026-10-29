import { z } from "zod";

const positiveQuantity = z.number().finite().positive().max(1_000_000_000);
export const importDeclarationIdSchema = z.string().uuid();

export const declareImportSchema = z.object({
  // Product IDs are stored as text and production seed data uses stable IDs
  // such as "prod-soap-001", not only UUIDs.
  productId: z.string().trim().min(1).max(128),
  productionMaterialId: z.string().trim().min(1).max(128).optional(),
  expectedQuantity: positiveQuantity,
  customsRef: z.string().trim().max(200).optional(),
  originCountry: z.string().trim().max(100).optional(),
  supplier: z.string().trim().max(200).optional(),
  estimatedValue: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()).optional(),
  expectedReturnDate: z.date().optional(),
}).strict();

export const submitImportArrivalSchema = z.object({
  actualQuantity: positiveQuantity,
  invoiceRef: z.string().trim().min(1).max(200),
  supportingDoc: z.string().trim().max(300).regex(
    /^\/api\/import-invoice\/[0-9a-f-]{36}_[0-9a-f-]{36}\.pdf$/i,
  ),
}).strict();

export const confirmImportArrivalSchema = z.object({
  inspectedQuantity: positiveQuantity.optional(),
  reviewerNote: z.string().trim().max(2_000).optional(),
}).strict();

export const rejectImportArrivalSchema = z.string().trim().min(1).max(2_000);
