import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { loadPublicSalesInvoice } from '@/lib/sales-invoice-access';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Invoice verification | TaxFlow',
  robots: { index: false, follow: false, noarchive: true },
};

const invoiceIdSchema = z.string().uuid();
const money = (value: number): string => `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)} RWF`;
const issuedDate = (value: string | Date): string => new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
}).format(new Date(value));

export default async function PublicInvoiceVerificationPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  const parsedId = invoiceIdSchema.safeParse(invoiceId);
  if (!parsedId.success) notFound();

  const invoice = await loadPublicSalesInvoice(parsedId.data);
  if (!invoice) notFound();
  const { snapshot } = invoice;

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl space-y-5 bg-slate-50 p-4 text-slate-950 sm:p-8">
      <header className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">TaxFlow invoice verification</p>
        <h1 className="mt-2 text-2xl font-bold">{snapshot.invoiceNumber}</h1>
        <p className="mt-2 text-sm text-slate-700">This is an immutable TaxFlow sales invoice record. The details below match the invoice snapshot stored by TaxFlow.</p>
        <p className="mt-2 text-sm font-medium text-amber-900">This page is public to anyone who has the QR code or link and displays the invoice details below.</p>
      </header>

      <section className="grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2" aria-label="Invoice status and transaction">
        <dl className="grid gap-3 text-sm">
          <div><dt className="text-slate-500">Verification</dt><dd className="font-semibold text-emerald-800">Valid TaxFlow invoice record</dd></div>
          <div><dt className="text-slate-500">Status</dt><dd className="font-semibold">{snapshot.transaction.status}</dd></div>
          <div><dt className="text-slate-500">Issue date</dt><dd>{issuedDate(snapshot.issuedAt)}</dd></div>
          <div><dt className="text-slate-500">Transaction reference</dt><dd className="break-all font-mono text-xs">{snapshot.transaction.id}</dd></div>
          <div><dt className="text-slate-500">Transaction type</dt><dd>{snapshot.transaction.transactionType}</dd></div>
          <div><dt className="text-slate-500">Currency</dt><dd>{snapshot.currency}</dd></div>
        </dl>
        <aside className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm" aria-label="Important notice">
          <h2 className="font-semibold text-amber-900">Important notice</h2>
          <p className="mt-2">This is a TaxFlow sales document, not a TF/EBM fiscal invoice. Invoice details do not prove payment, and payment status is not certified by this page.</p>
        </aside>
      </section>

      <section className="grid gap-4 sm:grid-cols-2" aria-label="Seller and buyer">
        {[
          { title: 'Seller', party: snapshot.seller },
          { title: 'Buyer', party: snapshot.buyer },
        ].map(({ title, party }) => (
          <article key={title} className="rounded-xl border border-blue-200 bg-white p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-blue-950">{title}</h2>
            <p className="mt-2 font-semibold">{party.name}</p>
            <p className="mt-1 text-sm text-slate-600">TIN: {party.tin ?? 'Not recorded'}</p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border border-blue-200 bg-white" aria-label="Invoice line items">
        <h2 className="border-b bg-blue-950 px-5 py-3 font-semibold text-white">Invoice details</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">#</th><th className="px-4 py-3">Description</th><th className="px-4 py-3 text-right">Quantity</th><th className="px-4 py-3">Unit</th><th className="px-4 py-3 text-right">Unit price</th><th className="px-4 py-3 text-right">VAT rate</th><th className="px-4 py-3 text-right">Recorded VAT</th><th className="px-4 py-3 text-right">Line total</th>
              </tr>
            </thead>
            <tbody>{snapshot.lines.map((line, index) => (
              <tr key={`${line.description}-${index}`} className="border-t">
                <td className="px-4 py-3">{index + 1}</td>
                <td className="px-4 py-3 font-medium">{line.description}</td>
                <td className="px-4 py-3 text-right tabular-nums">{line.quantity.toLocaleString('en-US')}</td>
                <td className="px-4 py-3">{line.unit}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(line.unitPriceRwf)}</td>
                <td className="px-4 py-3 text-right">{line.vatRateBasisPoints === null ? '—' : `${(line.vatRateBasisPoints / 100).toLocaleString('en-US')}%`}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(line.vatRwf)}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(line.totalRwf)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <dl className="ml-auto grid max-w-md gap-2 border-t p-5 text-sm">
          <div className="flex justify-between gap-4"><dt>Subtotal (excl. VAT)</dt><dd>{money(snapshot.subtotalRwf)}</dd></div>
          <div className="flex justify-between gap-4"><dt>Recorded VAT</dt><dd>{money(snapshot.recordedVatRwf)}</dd></div>
          <div className="flex justify-between gap-4 border-t pt-3 text-base font-bold text-emerald-800"><dt>Invoice total</dt><dd>{money(snapshot.totalRwf)}</dd></div>
        </dl>
      </section>

      <footer className="rounded-xl border bg-white p-4 text-xs leading-5 text-slate-600">
        <p>Verification confirms that this invoice snapshot exists in TaxFlow and has not been altered in the system. It does not confirm physical delivery, tax assessment, or payment.</p>
        <p className="mt-2">Issued {issuedDate(invoice.issuedAt)} · Powered by TaxFlow</p>
      </footer>
    </main>
  );
}
