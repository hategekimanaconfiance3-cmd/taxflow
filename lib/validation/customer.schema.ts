import { z } from 'zod';

export const customerSchema = z.object({
  name: z.string().trim().min(1, 'Enter a customer name.').max(160),
  customerType: z.enum(['individual', 'business', 'institution']),
  tinNumber: z.string().trim().regex(/^\d{9}$/, 'TIN must contain exactly 9 digits.').optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  email: z.string().trim().email('Enter a valid email address.').max(254).optional().or(z.literal('')),
});

export const saveCustomerSchema = z.object({
  id: z.string().uuid().optional(),
  customer: customerSchema,
});

export type CustomerInput = z.infer<typeof customerSchema>;
export type SaveCustomerInput = z.infer<typeof saveCustomerSchema>;
