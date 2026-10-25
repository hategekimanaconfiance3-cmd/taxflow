import { z } from "zod";

export const tickerRowsSchema = z.array(z.object({
  id: z.string(),
  businessName: z.string(),
  tinNumber: z.string().nullable(),
  totalAmount: z.number(),
  vatAmount: z.number(),
  status: z.string(),
  createdAt: z.string().datetime(),
  items: z.array(z.object({
    id: z.string(),
    productName: z.string(),
    quantity: z.number(),
    unitPrice: z.number(),
    totalPrice: z.number(),
    vatAmount: z.number(),
  }).strict()),
}).strict());
