import { requireApprovedClearance } from '@/lib/auth-guard';
import { getProducts } from '@/lib/actions/stock.action';
import { getImportDeclarations } from '@/lib/actions/import.action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, Ship, PackageCheck, FileText } from 'lucide-react';
import { ImportForm } from '@/components/dashboard/import-form/import-form';
import { SubmitArrivalButton } from '@/components/dashboard/import-form/confirm-arrival-button';

const STATUS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Awaiting return', variant: 'outline' },
  submitted: { label: 'Awaiting RRA inspection', variant: 'secondary' },
  activated: { label: 'Customs confirmed in TaxFlow', variant: 'default' },
  rejected: { label: 'Flagged — follow up required', variant: 'destructive' },
};

export default async function ImportsPage() {
  await requireApprovedClearance();
  const [products, declarations] = await Promise.all([getProducts(), getImportDeclarations()]);
  const formProducts = products.map((p) => ({ id: p.id, name: p.name, unit: p.unit }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">TaxFlow Smart Customs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Declare goods before your expected return to Rwanda, submit arrival evidence, and track the RRA inspection recorded in TaxFlow.
          This record does not replace any legally required customs declaration or official clearance process.
        </p>
      </div>

      <ImportForm products={formProducts} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4" />
            My Customs Declarations
            <Badge variant="secondary" className="ml-auto">{declarations.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {declarations.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Your declarations will appear here after you create one.</p>
          ) : (
            <div className="divide-y">
              {declarations.map((d) => {
                const status = STATUS[d.status] ?? { label: d.status, variant: 'secondary' as const };
                return (
                  <div key={d.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        {d.status === 'activated' ? <PackageCheck className="mt-0.5 h-4 w-4 text-emerald-600" /> : <Ship className="mt-0.5 h-4 w-4 text-muted-foreground" />}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{d.productName}</p>
                          <p className="text-xs text-muted-foreground">
                            Expected: {d.expectedQuantity.toLocaleString()} {d.productUnit}
                            {d.originCountry ? ` · Country: ${d.originCountry}` : ''}
                            {d.expectedReturnDate ? ` · Expected return: ${d.expectedReturnDate}` : ''}
                          </p>
                          {d.supplierName && <p className="text-xs text-muted-foreground">Supplier: {d.supplierName}</p>}
                          {d.estimatedValue != null && <p className="text-xs text-muted-foreground">Estimated value: {d.estimatedValue.toLocaleString()} {d.currency}</p>}
                          {d.customsRef && <p className="mt-1 font-mono text-xs text-muted-foreground">Reference: {d.customsRef}</p>}
                        </div>
                      </div>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>

                    {d.actualQuantity != null && (
                      <p className="pl-6 text-xs text-muted-foreground">Merchant-reported arrival quantity: {d.actualQuantity.toLocaleString()} {d.productUnit}</p>
                    )}
                    {d.inspectedQuantity != null && (
                      <p className="pl-6 text-xs font-medium text-emerald-700">Quantity inspected by RRA officer: {d.inspectedQuantity.toLocaleString()} {d.productUnit}</p>
                    )}
                    {d.inspectedAt && <p className="pl-6 text-xs text-muted-foreground">Inspection recorded: {new Date(d.inspectedAt).toLocaleString()}</p>}
                    {d.invoiceRef && <p className="pl-6 text-xs text-muted-foreground">Invoice reference: {d.invoiceRef}</p>}
                    {d.supportingDoc && (
                      <p className="flex items-center gap-1 pl-6 text-xs text-muted-foreground">
                        <FileText className="h-3 w-3" />
                        {d.supportingDoc.startsWith('/uploads') ? <a className="underline" href={d.supportingDoc} target="_blank" rel="noopener noreferrer">View submitted supporting document</a> : d.supportingDoc}
                      </p>
                    )}
                    {d.inspectionNote && (
                      <div className={`ml-6 rounded-md border px-3 py-2 text-xs ${d.status === 'rejected' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'text-muted-foreground'}`}>
                        {d.status === 'rejected' ? 'RRA review note: ' : 'Inspection note: '}{d.inspectionNote}
                      </div>
                    )}
                    {d.status === 'pending' && (
                      <div className="pl-6">
                        <SubmitArrivalButton declarationId={d.id} productName={d.productName} expectedQuantity={d.expectedQuantity} />
                      </div>
                    )}
                    {d.status === 'rejected' && (
                      <p className="pl-6 text-xs text-muted-foreground">This declaration was flagged. Contact the relevant RRA/customs office for the correction or next-step process; do not create a false replacement declaration.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
