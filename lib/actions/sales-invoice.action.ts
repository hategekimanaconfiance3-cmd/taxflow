'use server';

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import db from '@/db/drizzle';
import { salesInvoice } from '@/db/schema';
import { requireTraderSession } from '@/lib/auth-guard';
import { attemptSalesInvoiceEmail } from '@/lib/sales-invoice-delivery';
import { loadSalesInvoiceForParty } from '@/lib/sales-invoice-access';

const invoiceIdSchema = z.string().uuid();

export async function getSalesInvoice(invoiceId: string) {
  const session = await requireTraderSession();
  const parsed = invoiceIdSchema.safeParse(invoiceId);
  if (!parsed.success) throw new Error('Invoice not found.');
  return loadSalesInvoiceForParty(parsed.data, session.user.id);
}

export async function retrySalesInvoiceEmail(invoiceId: string) {
  const session = await requireTraderSession();
  const parsed = invoiceIdSchema.safeParse(invoiceId);
  if (!parsed.success) throw new Error('Invoice not found.');
  const [invoice] = await db.select({ id: salesInvoice.id, sellerId: salesInvoice.sellerId })
    .from(salesInvoice).where(eq(salesInvoice.id, parsed.data)).limit(1);
  if (!invoice || invoice.sellerId !== session.user.id) {
    throw new Error('Only the seller can retry invoice email delivery.');
  }
  return { status: await attemptSalesInvoiceEmail(invoice.id, session.user.id) };
}
