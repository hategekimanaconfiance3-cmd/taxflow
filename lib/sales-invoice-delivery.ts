import "server-only";

import { Resend } from "resend";
import { and, eq } from "drizzle-orm";
import db from "@/db/drizzle";
import { auditLog, salesInvoice, salesInvoiceEmailDelivery, user } from "@/db/schema";
import { parseSalesInvoiceSnapshot } from "@/lib/sales-invoice-types";
import { renderSalesInvoicePdf } from "@/lib/sales-invoice-pdf";

export type InvoiceEmailAttemptResult = "sent" | "failed" | "not_available";

/** Attempts one idempotent send; invoices remain available if email delivery fails. */
export async function attemptSalesInvoiceEmail(
  invoiceId: string,
  actorUserId: string,
): Promise<InvoiceEmailAttemptResult> {
  const reserved = await db.transaction(async (tx) => {
    const [invoice] = await tx.select().from(salesInvoice)
      .where(eq(salesInvoice.id, invoiceId)).for("update").limit(1);
    if (!invoice) throw new Error("Invoice not found.");
    const [delivery] = await tx.select().from(salesInvoiceEmailDelivery)
      .where(eq(salesInvoiceEmailDelivery.invoiceId, invoiceId)).for("update").limit(1);
    if (!delivery) throw new Error("Invoice email status is unavailable.");
    if (delivery.status === "sent") return { state: "sent" as const };

    const [recipient] = invoice.buyerId
      ? await tx.select({ id: user.id, email: user.email, emailVerified: user.emailVerified, isActive: user.isActive, clearanceStatus: user.clearanceStatus })
        .from(user).where(eq(user.id, invoice.buyerId)).limit(1)
      : [];
    if (!recipient?.emailVerified || !recipient.isActive || recipient.clearanceStatus !== "approved") {
      await tx.update(salesInvoiceEmailDelivery).set({
        status: "not_available",
        lastErrorCode: "verified_recipient_unavailable",
        updatedAt: new Date(),
      }).where(eq(salesInvoiceEmailDelivery.invoiceId, invoiceId));
      return { state: "not_available" as const };
    }

    const now = new Date();
    const isRecentInFlight = delivery.status === "sending" && delivery.lastAttemptAt
      && now.getTime() - delivery.lastAttemptAt.getTime() < 10 * 60 * 1000;
    if (isRecentInFlight) throw new Error("Invoice email is already being sent.");

    const attemptCount = delivery.attemptCount + 1;
    await tx.update(salesInvoiceEmailDelivery).set({
      status: "sending",
      attemptCount,
      lastAttemptAt: now,
      lastErrorCode: null,
      updatedAt: now,
    }).where(eq(salesInvoiceEmailDelivery.invoiceId, invoiceId));
    await tx.insert(auditLog).values({
      userId: actorUserId,
      action: "SALES_INVOICE_EMAIL_ATTEMPTED",
      targetType: "sales_invoice",
      targetId: invoice.id,
      metadata: JSON.stringify({ invoiceNumber: invoice.invoiceNumber, attemptCount }),
    });
    return { state: "reserved" as const, invoice, email: recipient.email, attemptCount };
  });

  if (reserved.state !== "reserved") return reserved.state;

  const fail = async (code: string): Promise<"failed"> => {
    await db.transaction(async (tx) => {
      await tx.update(salesInvoiceEmailDelivery).set({ status: "failed", lastErrorCode: code, updatedAt: new Date() })
        .where(and(eq(salesInvoiceEmailDelivery.invoiceId, invoiceId), eq(salesInvoiceEmailDelivery.status, "sending")));
      await tx.insert(auditLog).values({
        userId: actorUserId,
        action: "SALES_INVOICE_EMAIL_FAILED",
        targetType: "sales_invoice",
        targetId: invoiceId,
        metadata: JSON.stringify({ code, attemptCount: reserved.attemptCount }),
      });
    });
    return "failed";
  };

  if (!process.env.RESEND_API_KEY) return fail("email_provider_not_configured");

  try {
    const snapshot = parseSalesInvoiceSnapshot(reserved.invoice.snapshot);
    const pdf = renderSalesInvoicePdf(snapshot);
    const appUrl = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
    const invoiceUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/dashboard/invoices/${invoiceId}` : null;
    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: process.env.TAXFLOW_EMAIL_FROM || "TaxFlow <onboarding@resend.dev>",
      to: reserved.email,
      subject: `Your TaxFlow Sales Invoice — ${snapshot.invoiceNumber}`,
      text: [
        `Your TaxFlow sales invoice ${snapshot.invoiceNumber} is attached.`,
        `Seller: ${snapshot.seller.name}`,
        `Date: ${new Date(snapshot.issuedAt).toLocaleDateString("en-GB", { timeZone: "UTC" })}`,
        `Transaction reference: ${snapshot.transaction.id}`,
        `Total: ${snapshot.totalRwf.toLocaleString("en-US")} RWF`,
        invoiceUrl ? `Secure invoice link: ${invoiceUrl} (sign-in required)` : "",
        "This is a TaxFlow sales invoice, not an RRA/EBM fiscal invoice.",
      ].filter(Boolean).join("\n"),
      attachments: [{ filename: `${snapshot.invoiceNumber}.pdf`, content: Buffer.from(pdf).toString("base64") }],
    }, { idempotencyKey: `sales-invoice-${invoiceId}` });

    if (result.error || !result.data?.id) {
      return fail("email_provider_rejected_request");
    }
    await db.transaction(async (tx) => {
      await tx.update(salesInvoiceEmailDelivery).set({
        status: "sent",
        providerMessageId: result.data.id,
        lastErrorCode: null,
        updatedAt: new Date(),
      }).where(and(eq(salesInvoiceEmailDelivery.invoiceId, invoiceId), eq(salesInvoiceEmailDelivery.status, "sending")));
      await tx.insert(auditLog).values({
        userId: actorUserId,
        action: "SALES_INVOICE_EMAIL_SENT",
        targetType: "sales_invoice",
        targetId: invoiceId,
        metadata: JSON.stringify({ invoiceNumber: snapshot.invoiceNumber, attemptCount: reserved.attemptCount }),
      });
    });
    return "sent";
  } catch (error) {
    console.error("Sales invoice email delivery failed", {
      invoiceId,
      code: error instanceof Error ? error.name : "unknown_provider_error",
    });
    return fail("email_provider_error");
  }
}
