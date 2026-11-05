import { z } from 'zod';

export const importIntentSchema = z.object({
  productName: z.string().trim().min(1, 'Enter a product name.').max(160),
  plannedQuantity: z.number().finite().positive('Quantity must be greater than zero.').max(1_000_000_000),
  purchaseCountry: z.string().trim().min(1, 'Enter the country where you plan to buy this product.').max(100),
}).strict();

export type ImportIntentInput = z.infer<typeof importIntentSchema>;
