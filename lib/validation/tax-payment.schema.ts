import { z } from "zod";

/** Client input deliberately contains no amount; the server derives full due. */
export const createTaxPaymentSchema = () => {
    return z.object({
        method: z.enum(["mobile_money", "bank_transfer", "cash"], {
            message: "Payment method is required",
        }),
        reference: z.string().trim().max(100).optional(),
    }).strict();
}

/** Extended schema that also accepts partial payment percentage and saved method ID. */
export const smartTaxPaymentSchema = z.object({
    method: z.enum(["mobile_money", "bank_transfer", "cash"], {
        message: "Payment method is required",
    }),
    reference: z.string().trim().max(100).optional(),
    idempotencyKey: z.string().uuid(),
    /**
     * Percentage of outstanding balance to pay (95–100).
     * Defaults to 100 if not provided.
     * Server validates: must be >= 95 and <= 100.
     */
    paymentPercentage: z
        .number()
        .min(95, "Minimum payment is 95% of outstanding balance")
        .max(100, "Cannot pay more than 100% of outstanding balance")
        .optional()
        .default(100),
    /** ID of a saved payment method (optional) */
    savedMethodId: z.string().trim().optional(),
    /** One-off payer identifier when not using a saved method (phone number etc.) */
    oneOffIdentifier: z.string().trim().max(50).optional(),
}).strict();

export const taxPaymentSubmissionSchema = createTaxPaymentSchema().extend({
    idempotencyKey: z.uuid(),
}).strict();

export const taxPaymentReviewSchema = z.object({
    paymentId: z.string().trim().min(1).max(100),
    evidenceReference: z.string().trim().min(5).max(120),
    evidenceType: z.enum(['provider_settlement', 'bank_settlement', 'official_cash_receipt']),
    settledAmount: z.number().int().positive().safe(),
    reason: z.string().trim().min(10).max(500),
});

export type TaxPaymentReviewInput = z.infer<typeof taxPaymentReviewSchema>;

export const taxPaymentRejectionSchema = z.object({
    paymentId: z.string().trim().min(1).max(100),
    reason: z.string().trim().min(10).max(500),
});

/** Static type derived from the schema (generic — the `max` constraint is runtime only). */
export type TaxPaymentInput = z.infer<ReturnType<typeof createTaxPaymentSchema>>;
export type SmartTaxPaymentInput = z.infer<typeof smartTaxPaymentSchema>;
