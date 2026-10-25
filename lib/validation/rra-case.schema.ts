import { z } from "zod";

export const taxpayerInformationRequestSchema = z.object({
  caseId: z.string().trim().min(1).max(100),
  requestType: z.enum(["documents", "corrections"]),
  details: z.string().trim().min(10, "Describe the requested documents or corrections.").max(1500),
}).strict();

export type TaxpayerInformationRequest = z.infer<typeof taxpayerInformationRequestSchema>;
