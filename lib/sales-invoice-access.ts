import "server-only";

import { and, eq, or } from "drizzle-orm";
import db from "@/db/drizzle";
import { auditLog, salesInvoice, salesInvoiceEmailDelivery } from "@/db/schema";
import { parseSalesInvoiceSnapshot } from "@/lib/sales-invoice-types";

export async function loadSalesInvoiceForParty(invoiceId: string, actorUserId: string) {
  const [invoice] = await db.select().from(salesInvoice).where(and(
    eq(salesInvoice.id, invoiceId),
    or(eq(salesInvoice.sellerId, actorUserId), eq(salesInvoice.buyerId, actorUserId)),
  )).limit(1);
  if (!invoice) return null;

  const [delivery] = await db.select({ status: salesInvoiceEmailDelivery.status })
    .from(salesInvoiceEmailDelivery)
    .where(eq(salesInvoiceEmailDelivery.invoiceId, invoice.id)).limit(1);
  await db.insert(auditLog).values({
    userId: actorUserId,
    action: "SALES_INVOICE_ACCESSED",
    targetType: "sales_invoice",
    targetId: invoice.id,
    metadata: JSON.stringify({ invoiceNumber: invoice.invoiceNumber }),
  });
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    issuedAt: invoice.issuedAt,
    snapshot: parseSalesInvoiceSnapshot(invoice.snapshot),
    emailStatus: delivery?.status ?? "not_available",
    isSeller: invoice.sellerId === actorUserId,
  };
}
