import { z } from "zod";

/**
 * Creates a Zod schema for tax payment validation.
 * The `maxOutstanding` parameter caps the allowed payment amount to the
 * trader's current outstanding balance — preventing over-payment and
 * blocking submissions when no tax is owed.
 */
export function createTaxPaymentSchema(maxOutstanding: number) {
    return z.object({
        amount: z
            .number({ message: "Amount is required" })
            .int("Amount must be a whole number")
            .positive("Amount must be greater than zero")
            .max(
                maxOutstanding,
                `Amount cannot exceed outstanding balance of ${maxOutstanding.toLocaleString()} RWF`,
            ),
        method: z.enum(["mobile_money", "bank_transfer", "cash"], {
            message: "Payment method is required",
        }),
        reference: z.string().trim().max(100).optional(),
    });
}

export const taxPaymentSubmissionSchema = createTaxPaymentSchema(Number.MAX_SAFE_INTEGER).extend({
    idempotencyKey: z.uuid(),
});

/** Static type derived from the schema (generic — the `max` constraint is runtime only). */
export type TaxPaymentInput = z.infer<ReturnType<typeof createTaxPaymentSchema>>;

