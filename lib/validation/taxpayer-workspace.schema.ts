import { z } from "zod";

export const taxpayerAccessReasonSchema = z.enum([
  "customer_support",
  "transaction_investigation",
  "compliance_review",
  "audit",
  "case_management",
  "tin_operation",
  "other_authorized_purpose",
  "rra_assistant",
]);

export type TaxpayerAccessReason = z.infer<typeof taxpayerAccessReasonSchema>;
