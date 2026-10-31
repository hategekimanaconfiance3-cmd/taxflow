import { notFound } from 'next/navigation';
import { getSalesInvoice } from '@/lib/actions/sales-invoice.action';
import { SalesInvoiceActions } from '@/components/dashboard/sales-invoice/sales-invoice-actions';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';

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
    <main className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-8 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Sales invoice</h1>
          <p className="mt-1 text-sm text-muted-foreground">Issued for a completed TaxFlow transaction.</p>
        </div>
        <SalesInvoiceActions
          invoiceId={invoice.id}
          canRetryEmail={invoice.isSeller}
          emailStatus={invoice.emailStatus}
        />
      </div>

      <article className="rounded-xl border bg-white p-6 text-zinc-950 shadow-sm sm:p-10 print:rounded-none print:border-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-6 border-b pb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">TaxFlow</p>
            <h2 className="mt-2 text-3xl font-bold">Sales Invoice</h2>
            <p className="mt-2 max-w-xl text-sm text-zinc-600">TaxFlow sales document. This is not an RRA/EBM fiscal invoice.</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-sm text-zinc-500">Invoice number</p>
            <p className="font-mono text-xl font-semibold">{snapshot.invoiceNumber}</p>
            <p className="mt-2 text-sm text-zinc-600">Issued {new Date(snapshot.issuedAt).toLocaleDateString()}</p>
          </div>
        </div>

        <div className="grid gap-6 border-b py-6 sm:grid-cols-2">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Seller</h3>
            <p className="mt-2 font-semibold">{snapshot.seller.name}</p>
            {snapshot.seller.tin && <p className="text-sm text-zinc-600">TIN: {snapshot.seller.tin}</p>}
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Buyer</h3>
            <p className="mt-2 font-semibold">{snapshot.buyer.name}</p>
            {snapshot.buyer.tin && <p className="text-sm text-zinc-600">TIN: {snapshot.buyer.tin}</p>}
          </section>
        </div>

        <dl className="grid gap-4 border-b py-5 text-sm sm:grid-cols-3">
          <div><dt className="text-zinc-500">Transaction reference</dt><dd className="mt-1 break-all font-mono">{snapshot.transaction.id}</dd></div>
          <div><dt className="text-zinc-500">Transaction status</dt><dd className="mt-1 capitalize">{snapshot.transaction.status}</dd></div>
          <div><dt className="text-zinc-500">Currency</dt><dd className="mt-1">{snapshot.currency}</dd></div>
        </dl>

        <div className="overflow-x-auto py-6">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-3 pr-3">Description</th><th className="px-3 py-3 text-right">Quantity</th><th className="px-3 py-3">Unit</th><th className="px-3 py-3 text-right">Unit price</th><th className="px-3 py-3 text-right">VAT rate</th><th className="px-3 py-3 text-right">VAT amount</th><th className="py-3 pl-3 text-right">Total</th>
            </tr></thead>
            <tbody>{snapshot.lines.map((line, index) => (
              <tr key={`${line.description}-${index}`} className="border-b last:border-0">
                <td className="py-4 pr-3">{line.description}</td><td className="px-3 py-4 text-right">{line.quantity.toLocaleString()}</td><td className="px-3 py-4">{line.unit}</td><td className="px-3 py-4 text-right">{formatRWF(line.unitPriceRwf)}</td><td className="px-3 py-4 text-right">{line.vatRateBasisPoints === null ? '—' : `${(line.vatRateBasisPoints / 100).toLocaleString()}%`}</td><td className="px-3 py-4 text-right">{formatRWF(line.vatRwf)}</td><td className="py-4 pl-3 text-right font-medium">{formatRWF(line.totalRwf)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>

        <div className="ml-auto max-w-sm space-y-2 border-t pt-5 text-sm">
          <div className="flex justify-between gap-4"><span className="text-zinc-600">Subtotal</span><span>{formatRWF(snapshot.subtotalRwf)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-zinc-600">Recorded VAT</span><span>{formatRWF(snapshot.recordedVatRwf)}</span></div>
          <div className="flex justify-between gap-4 border-t pt-3 text-base font-bold"><span>Invoice total</span><span>{formatRWF(snapshot.totalRwf)}</span></div>
        </div>
        <p className="mt-8 border-t pt-4 text-xs text-zinc-500">The invoice amount is not evidence of payment. Payment status is not certified by this document. This document is not an RRA/EBM fiscal invoice.</p>
      </article>
    </main>
  );
}
