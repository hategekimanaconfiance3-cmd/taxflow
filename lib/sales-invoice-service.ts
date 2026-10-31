import "server-only";

import { eq, sql } from "drizzle-orm";
import db from "@/db/drizzle";
import {
  auditLog,
  customer,
  product,
  salesInvoice,
  salesInvoiceEmailDelivery,
  transaction,
  transactionItem,
  user,
} from "@/db/schema";
import type { SalesInvoiceSnapshot } from '@/lib/sales-invoice-types';
import { parseSalesInvoiceSnapshot } from '@/lib/sales-invoice-types';

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type TransactionRow = typeof transaction.$inferSelect;

export async function createSalesInvoiceForTransaction(
  tx: DatabaseTransaction,
  txn: TransactionRow,
  actorUserId: string,
  issuedAt: Date,
): Promise<typeof salesInvoice.$inferSelect> {
  if (!txn.buyerId && txn.transactionType !== "RETAIL_SALE") {
    throw new Error("A sales invoice requires an identified buyer or a retail sale.");
  }
  if (txn.status !== "confirmed" && txn.status !== "completed") {
    throw new Error("An invoice can only be issued for a confirmed or completed transaction.");
  }

  const [existing] = await tx.select().from(salesInvoice)
    .where(eq(salesInvoice.transactionId, txn.id)).limit(1);
  if (existing) return existing;

  const [sequence] = await tx.select({ value: sql<number>`nextval('public.sales_invoice_number_seq')` })
    .from(user).where(eq(user.id, txn.sellerId)).limit(1);
  if (!sequence) throw new Error("Invoice numbering is unavailable.");
  const year = issuedAt.getUTCFullYear();
  const invoiceNumber = `INV-${year}-${String(sequence.value).padStart(8, "0")}`;

  const [sellerRows, buyerRows, itemRows, transactionLines] = await Promise.all([
    tx.select({ name: user.name, businessName: user.businessName, tin: user.tinNumber })
      .from(user).where(eq(user.id, txn.sellerId)).limit(1),
    tx.select({ name: user.name, businessName: user.businessName, tin: user.tinNumber })
      .from(user).where(eq(user.id, txn.buyerId ?? "")).limit(1),
    tx.select({ name: product.name, unit: product.unit }).from(product)
      .where(eq(product.id, txn.productId)).limit(1),
    tx.select().from(transactionItem).where(eq(transactionItem.transactionId, txn.id)),
  ]);
  const seller = sellerRows[0];
  const buyer = buyerRows[0];
  const item = itemRows[0];
  if (!seller || !item) throw new Error("Invoice seller or product details are unavailable.");

  let buyerName = buyer?.businessName || buyer?.name || txn.buyerName || "Customer";
  let buyerTin = buyer?.tin ?? null;
  if (!txn.buyerId && txn.customerId) {
    const [savedCustomer] = await tx.select({ name: customer.name, tin: customer.tinNumber })
      .from(customer).where(eq(customer.id, txn.customerId)).limit(1);
    if (savedCustomer) {
      buyerName = savedCustomer.name;
      buyerTin = savedCustomer.tin;
    }
  }

  const lines = transactionLines.length > 0
    ? transactionLines.map((line) => ({
      description: line.productName,
      quantity: line.quantity,
      unit: item.unit,
      unitPriceRwf: line.unitPrice,
      subtotalRwf: line.totalPrice,
      vatRateBasisPoints: txn.vatRateBasisPoints,
      vatRwf: line.vatAmount,
      totalRwf: line.totalPrice + line.vatAmount,
    }))
    : [{
      description: item.name,
      quantity: txn.quantity,
      unit: item.unit,
      unitPriceRwf: txn.unitPrice,
      subtotalRwf: txn.totalAmount,
      vatRateBasisPoints: txn.vatRateBasisPoints,
      vatRwf: txn.vatAmount,
      totalRwf: txn.totalAmount + txn.vatAmount,
    }];

  const snapshot: SalesInvoiceSnapshot = {
    schemaVersion: 1,
    invoiceNumber,
    issuedAt: issuedAt.toISOString(),
    currency: "RWF",
    transaction: {
      id: txn.id,
      status: txn.status,
      transactionType: txn.transactionType,
    },
    seller: { name: seller.businessName || seller.name, tin: seller.tin },
    buyer: { name: buyerName, tin: buyerTin },
    lines,
    subtotalRwf: txn.totalAmount,
    recordedVatRwf: txn.vatAmount,
    totalRwf: txn.totalAmount + txn.vatAmount,
  };

  const [invoice] = await tx.insert(salesInvoice).values({
    invoiceNumber,
    transactionId: txn.id,
    sellerId: txn.sellerId,
    buyerId: txn.buyerId,
    snapshot: snapshot as unknown as Record<string, unknown>,
    issuedAt,
  }).returning();
  if (!invoice) throw new Error("The sales invoice snapshot could not be saved.");

  await tx.insert(salesInvoiceEmailDelivery).values({
    invoiceId: invoice.id,
    status: txn.buyerId ? "pending" : "not_available",
  });
  await tx.insert(auditLog).values({
    userId: actorUserId,
    action: "SALES_INVOICE_ISSUED",
    targetType: "sales_invoice",
    targetId: invoice.id,
    metadata: JSON.stringify({ transactionId: txn.id, invoiceNumber, issuedAt }),
  });
  return invoice;
}

export { parseSalesInvoiceSnapshot };
