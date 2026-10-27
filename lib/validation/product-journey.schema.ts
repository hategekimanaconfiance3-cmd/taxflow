import { z } from "zod";

export const productJourneyQuerySchema = z.object({
    query: z.string().trim().max(120).default(""),
    status: z.enum(["all", "pending", "confirmed", "completed", "rejected", "expired", "disputed"]).default("all"),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    offset: z.number().int().min(0).max(100_000).default(0),
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "Start date must be before end date.",
    path: ["from"],
});

export type ProductJourneyQuery = z.infer<typeof productJourneyQuerySchema>;
