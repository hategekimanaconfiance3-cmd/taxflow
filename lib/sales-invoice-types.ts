import { z } from 'zod';

export interface SalesInvoiceSnapshot {
  schemaVersion: 1;
  invoiceNumber: string;
  issuedAt: string;
  currency: 'RWF';
  transaction: { id: string; status: 'confirmed' | 'completed'; transactionType: string };
  seller: { name: string; tin: string | null };
  buyer: { name: string; tin: string | null };
  lines: Array<{
    description: string;
    quantity: number;
    unit: string;
    unitPriceRwf: number;
    subtotalRwf: number;
    vatRateBasisPoints: number | null;
    vatRwf: number;
    totalRwf: number;
  }>;
  subtotalRwf: number;
  recordedVatRwf: number;
  totalRwf: number;
}

const snapshotSchema = z.object({
  schemaVersion: z.literal(1),
  invoiceNumber: z.string().min(1),
  issuedAt: z.string().datetime(),
  currency: z.literal('RWF'),
  transaction: z.object({ id: z.string().min(1), status: z.enum(['confirmed', 'completed']), transactionType: z.string().min(1) }),
  seller: z.object({ name: z.string().min(1), tin: z.string().nullable() }),
  buyer: z.object({ name: z.string().min(1), tin: z.string().nullable() }),
  lines: z.array(z.object({
    description: z.string().min(1), quantity: z.number().finite().positive(), unit: z.string().min(1),
    unitPriceRwf: z.number().int().nonnegative(), subtotalRwf: z.number().int().nonnegative(),
    vatRateBasisPoints: z.number().int().nonnegative().nullable(), vatRwf: z.number().int().nonnegative(),
    totalRwf: z.number().int().nonnegative(),
  })).min(1),
  subtotalRwf: z.number().int().nonnegative(),
  recordedVatRwf: z.number().int().nonnegative(),
  totalRwf: z.number().int().nonnegative(),
});

export function parseSalesInvoiceSnapshot(value: unknown): SalesInvoiceSnapshot {
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success) throw new Error('The stored invoice snapshot is invalid.');
  return parsed.data;
}
