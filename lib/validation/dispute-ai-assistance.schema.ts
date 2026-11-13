import { z } from "zod";

export const disputeAiAssistanceSchema = z.object({
  disputeId: z.string().uuid(),
  task: z.enum(["internal_notes", "official_communication", "suggestions"]),
  action: z.enum(["undo_transaction", "adjust_amount", "uphold_dispute", "dismiss"]).optional(),
  adjustedUnitPrice: z.number().int().positive().optional(),
  existingDraft: z.string().trim().max(6000).default(""),
});

export type DisputeAiAssistanceInput = z.infer<typeof disputeAiAssistanceSchema>;
