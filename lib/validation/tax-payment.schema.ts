import { z } from "zod";

/** Client input deliberately contains no amount; the server derives full due. */
export const createTaxPaymentSchema = () => {
    return z.object({
        obligationId: z.uuid(),
        method: z.enum(["mobile_money", "bank_transfer", "cash"], {
            message: "Payment method is required",
        }),
        reference: z.string().trim().max(100).optional(),
    }).strict();
}

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

export const simulatedPaymentInitiationSchema = z.object({
    paymentId: z.uuid(),
    provider: z.enum(["mtn_mobile_money", "airtel_money", "bank_gateway"]),
    scenario: z.enum(["success", "pending", "rejected", "insufficient_funds", "invalid_payer", "timeout", "unavailable", "delayed", "expired"]).optional(),
}).strict();

export const simulatedPaymentAuthorizationSchema = z.object({ paymentId: z.uuid() }).strict();

/** Static type derived from the schema (generic — the `max` constraint is runtime only). */
export type TaxPaymentInput = z.infer<ReturnType<typeof createTaxPaymentSchema>>;

