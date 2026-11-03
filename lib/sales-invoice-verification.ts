import "server-only";

/** Builds a scan URL using only trusted deployment configuration, never request Host headers. */
export function getSalesInvoiceVerificationUrl(invoiceId: string): string {
  const configuredBase = process.env.NEXT_PUBLIC_APP_URL
    || process.env.BETTER_AUTH_URL
    || process.env.VERCEL_PROJECT_PRODUCTION_URL
    || process.env.VERCEL_URL
    || "http://localhost:3000";
  const baseWithProtocol = /^https?:\/\//i.test(configuredBase) ? configuredBase : `https://${configuredBase}`;
  const base = new URL(baseWithProtocol);
  if (base.protocol !== "https:" && base.hostname !== "localhost") {
    throw new Error("Invoice verification requires a secure application URL.");
  }
  return new URL(`/invoice/verify/${encodeURIComponent(invoiceId)}`, base.origin).toString();
}
