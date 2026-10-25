import { z } from "zod";

const optionalPhoneSchema = z.string().trim().max(32, "Phone number is too long.").refine(
  (value) => value === "" || /^\+?[0-9][0-9()\s-]{4,30}$/.test(value),
  "Enter a valid phone number.",
);

export const taxpayerEditFieldsSchema = z.object({
  name: z.string().trim().min(2, "Enter the taxpayer's name.").max(120),
  businessName: z.string().trim().max(160, "Business name is too long."),
  phoneNumber: optionalPhoneSchema,
  email: z.string().trim().email("Enter a valid email address.").max(254),
  reason: z.string().trim().min(10, "Enter a reason of at least 10 characters.").max(1000),
}).strict();

export const clearanceReasonSchema = z.object({
  reason: z.string().trim().min(10, "Enter a reason of at least 10 characters.").max(1000),
}).strict();

export const editTaxpayerSchema = taxpayerEditFieldsSchema.extend({
  traderId: z.string().trim().min(1).max(128),
}).strict();

export const updateClearanceStatusSchema = z.object({
  traderId: z.string().trim().min(1).max(128),
  status: z.enum(["approved", "under_review", "suspended"]),
  reason: clearanceReasonSchema.shape.reason,
}).strict();

export type TaxpayerEditFields = z.infer<typeof taxpayerEditFieldsSchema>;
