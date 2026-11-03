import Image from 'next/image';
import { notFound } from 'next/navigation';
import {
  BadgeCheck,
  CalendarDays,
  CircleDollarSign,
  FileCheck2,
  Hash,
  Landmark,
  ReceiptText,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { getSalesInvoice } from '@/lib/actions/sales-invoice.action';
import { SalesInvoiceActions } from '@/components/dashboard/sales-invoice/sales-invoice-actions';
const formatInvoiceRwf = (amount: number): string => `${new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
}).format(amount)} RWF`;

const issuedDate = (value: string): string => new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
}).format(new Date(value));

export default async function SalesInvoicePage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  const invoice = await getSalesInvoice(invoiceId);
  if (!invoice) notFound();
  const snapshot = invoice.snapshot;

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-7 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales invoice</h1>
          <p className="mt-1 text-sm text-muted-foreground">Issued for a completed TaxFlow transaction.</p>
        </div>
        <SalesInvoiceActions
          invoiceId={invoice.id}
          canRetryEmail={invoice.isSeller}
          emailStatus={invoice.emailStatus}
        />
      </div>

      <article className="overflow-hidden rounded-2xl border border-blue-200 bg-white text-slate-950 shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <div className="space-y-6 p-5 sm:p-8 print:p-6">
          <header className="grid gap-6 border-b border-blue-200 pb-6 lg:grid-cols-[1fr_auto] lg:items-start">
            <div className="flex flex-wrap items-start gap-5">
              <div className="flex min-w-[185px] items-center border-r border-blue-100 pr-5">
                <Image src="/taxflow.png" alt="TaxFlow" width={190} height={64} className="h-14 w-auto object-contain" priority />
              </div>
              <div className="max-w-md">
                <h2 className="text-2xl font-bold tracking-tight text-blue-950 sm:text-3xl">TaxFlow Sales Invoice</h2>
                <p className="mt-1 text-sm text-slate-600">TaxFlow sales document</p>
                <p className="mt-1 text-sm font-medium text-red-700">This is not an RRA/EBM fiscal invoice.</p>
              </div>
            </div>

            <section className="min-w-64 rounded-xl border border-blue-100 bg-blue-50/50 p-4" aria-label="Invoice details">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Invoice number</p>
                  <p className="mt-1 break-all font-mono text-lg font-bold text-emerald-800">{snapshot.invoiceNumber}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                  <BadgeCheck className="h-3.5 w-3.5" /> Confirmed
                </span>
              </div>
              <dl className="mt-4 grid gap-2 text-sm">
                <div className="flex items-start gap-2"><CalendarDays className="mt-0.5 h-4 w-4 text-blue-800" /><dt className="font-medium">Issued:</dt><dd>{issuedDate(snapshot.issuedAt)}</dd></div>
                <div className="flex items-start gap-2"><Hash className="mt-0.5 h-4 w-4 text-blue-800" /><dt className="font-medium">Transaction:</dt><dd className="break-all font-mono text-xs">{snapshot.transaction.id}</dd></div>
                <div className="flex items-start gap-2"><CircleDollarSign className="mt-0.5 h-4 w-4 text-blue-800" /><dt className="font-medium">Currency:</dt><dd>{snapshot.currency}</dd></div>
              </dl>
            </section>
          </header>

          <section className="grid gap-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 sm:grid-cols-[auto_1fr] sm:items-start" aria-label="Document summary">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-800"><ShieldCheck className="h-6 w-6" /></div>
            <div>
              <h3 className="font-semibold text-emerald-900">Document summary</h3>
              <p className="mt-1 text-sm leading-6 text-slate-700">This invoice records a TaxFlow transaction with confirmed or completed status. Amounts are stated in Rwandan Francs (RWF).</p>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2" aria-label="Seller and buyer">
            {[
              { label: 'Seller', name: snapshot.seller.name, tin: snapshot.seller.tin, icon: Landmark },
              { label: 'Buyer', name: snapshot.buyer.name, tin: snapshot.buyer.tin, icon: ReceiptText },
            ].map(({ label, name, tin, icon: PartyIcon }) => (
              <div key={label} className="flex min-h-32 items-start gap-4 rounded-xl border border-blue-200 p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-800"><PartyIcon className="h-6 w-6" /></div>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-950">{label}</p>
                  <p className="mt-1 break-words font-semibold">{name}</p>
                  {tin && <p className="mt-1 text-sm text-slate-600">TIN: <span className="font-mono">{tin}</span></p>}
                </div>
              </div>
            ))}
          </section>

          <section aria-label="Invoice items" className="overflow-x-auto rounded-xl border border-blue-200">
            <table className="w-full min-w-[850px] border-collapse text-sm">
              <thead className="bg-blue-950 text-white">
                <tr className="text-left text-xs uppercase tracking-wide">
                  <th className="px-3 py-3">#</th>
                  <th className="px-3 py-3">Description</th>
                  <th className="px-3 py-3 text-right">Quantity</th>
                  <th className="px-3 py-3">Unit</th>
                  <th className="px-3 py-3 text-right">Unit price (RWF)</th>
                  <th className="px-3 py-3 text-right">VAT rate</th>
                  <th className="px-3 py-3 text-right">Recorded VAT (RWF)</th>
                  <th className="px-3 py-3 text-right">Line total (RWF)</th>
                </tr>
              </thead>
              <tbody>{snapshot.lines.map((line, index) => (
                <tr key={`${line.description}-${index}`} className="border-t border-blue-100 even:bg-slate-50/70">
                  <td className="px-3 py-3">{index + 1}</td>
                  <td className="px-3 py-3 font-medium">{line.description}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{line.quantity.toLocaleString()}</td>
                  <td className="px-3 py-3">{line.unit}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatInvoiceRwf(line.unitPriceRwf)}</td>
                  <td className="px-3 py-3 text-right">{line.vatRateBasisPoints === null ? '—' : `${(line.vatRateBasisPoints / 100).toLocaleString()}%`}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatInvoiceRwf(line.vatRwf)}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatInvoiceRwf(line.totalRwf)}</td>
                </tr>
              ))}</tbody>
            </table>
          </section>

          <section className="grid gap-4 lg:grid-cols-3" aria-label="Invoice totals and notices">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 lg:col-span-1">
              <h3 className="flex items-center gap-2 font-semibold text-emerald-900"><ReceiptText className="h-5 w-5" /> Amounts summary</h3>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt>Subtotal (excl. VAT)</dt><dd className="font-medium tabular-nums">{formatInvoiceRwf(snapshot.subtotalRwf)}</dd></div>
                <div className="flex justify-between gap-3"><dt>Recorded VAT</dt><dd className="font-medium tabular-nums">{formatInvoiceRwf(snapshot.recordedVatRwf)}</dd></div>
                <div className="flex justify-between gap-3 border-t border-emerald-200 pt-3 text-base font-bold text-emerald-900"><dt>Invoice total (incl. VAT)</dt><dd className="text-right tabular-nums">{formatInvoiceRwf(snapshot.totalRwf)}</dd></div>
              </dl>
            </div>

            <aside className="rounded-xl border border-amber-300 bg-amber-50/70 p-4" aria-label="Important notice">
              <h3 className="flex items-center gap-2 font-semibold text-amber-900"><TriangleAlert className="h-5 w-5" /> Important notice</h3>
              <ul className="mt-3 space-y-1.5 text-sm leading-5 text-slate-700">
                <li>Invoice amount is not evidence of payment.</li>
                <li>Payment is recorded separately when confirmed.</li>
                <li>This document does not itself create tax liability.</li>
                <li>Tax liability is determined when authorized.</li>
              </ul>
            </aside>

            <section className="rounded-xl border border-blue-200 p-4" aria-label="Payment status">
              <h3 className="flex items-center gap-2 font-semibold text-blue-950"><CircleDollarSign className="h-5 w-5" /> Payment status</h3>
              <p className="mt-3 font-semibold text-blue-800">Not available on this invoice</p>
              <p className="mt-2 text-sm leading-5 text-slate-600">Payment is recorded separately when confirmed. This invoice does not certify payment.</p>
            </section>
          </section>

          <section className="grid gap-4 border-t border-dashed border-blue-200 pt-5 sm:grid-cols-[1fr_auto] sm:items-center" aria-label="Evidence and integrity">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-blue-200 text-blue-900"><FileCheck2 className="h-5 w-5" /></div>
              <div>
                <h3 className="font-semibold text-blue-950">Evidence &amp; integrity</h3>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">This invoice is an immutable snapshot of the transaction at issue. Its recorded details cannot be edited or deleted.</p>
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm sm:text-right">
              <p><span className="text-slate-500">Issued:</span> {issuedDate(snapshot.issuedAt)}</p>
              <p className="mt-1"><span className="text-slate-500">Document:</span> <span className="font-mono">{snapshot.invoiceNumber}</span></p>
              <p className="mt-1 inline-flex items-center gap-1 text-emerald-800"><ShieldCheck className="h-4 w-4" /> TaxFlow transaction record</p>
            </div>
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-blue-200 bg-blue-50/50 px-5 py-4 text-xs text-slate-600 sm:px-8 print:px-6">
          <span>Thank you for your business.</span>
          <span>Powered by <strong className="text-blue-950">TaxFlow</strong></span>
        </footer>
      </article>
    </main>
  );
}
