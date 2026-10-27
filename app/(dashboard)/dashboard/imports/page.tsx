import { requireApprovedClearance } from '@/lib/auth-guard';
import { getProducts } from '@/lib/actions/stock.action';
import { getImportDeclarations } from '@/lib/actions/import.action';
import { ImportForm } from '@/components/dashboard/import-form/import-form';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, PackageCheck } from 'lucide-react';
import { SubmitArrivalButton } from '@/components/dashboard/import-form/confirm-arrival-button';

export default async function ImportsPage() {
  await requireApprovedClearance();

  const [products, declarations] = await Promise.all([getProducts(), getImportDeclarations()]);
  const formProducts = products.map((p) => ({
    id: p.id,
    name: p.name,
    unit: p.unit,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Declare Import</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Register an incoming import declaration. It will be reviewed and activated by RRA staff.
        </p>
      </div>

      <ImportForm products={formProducts} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PackageCheck className="h-4 w-4" /> My Import Declarations
          </CardTitle>
          <p className="text-sm text-muted-foreground">Track arrival details, supporting invoices, and RRA review updates.</p>
        </CardHeader>
        <CardContent>
          {declarations.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No import declarations yet. New declarations will appear here so you can follow their progress.
            </div>
          ) : (
            <div className="space-y-3">
              {declarations.map((declaration) => {
                const statusLabel = declaration.status === 'submitted'
                  ? 'Awaiting RRA review'
                  : declaration.status === 'activated'
                    ? 'Approved and added to stock'
                    : declaration.status === 'rejected'
                      ? 'Action required'
                      : 'Arrival details needed';
                const statusClass = declaration.status === 'activated'
                  ? 'bg-emerald-100 text-emerald-800'
                  : declaration.status === 'rejected'
                    ? 'bg-red-100 text-red-800'
                    : declaration.status === 'submitted'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-amber-100 text-amber-800';

                return (
                  <div key={declaration.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{declaration.productName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {declaration.declarationRef ?? 'Import declaration'} · {new Date(declaration.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant="secondary" className={statusClass}>{statusLabel}</Badge>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <p><span className="text-muted-foreground">Expected:</span> {declaration.expectedQuantity} {declaration.productUnit}</p>
                      {declaration.actualQuantity != null && <p><span className="text-muted-foreground">Arrived:</span> {declaration.actualQuantity} {declaration.productUnit}</p>}
                      {declaration.invoiceRef && <p className="flex items-center gap-1"><FileText className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-muted-foreground">Invoice:</span> {declaration.invoiceRef}</p>}
                      {declaration.supportingDoc && <a className="flex items-center gap-1 text-primary underline-offset-4 hover:underline" href={declaration.supportingDoc} target="_blank" rel="noreferrer"><FileText className="h-3.5 w-3.5" />View invoice PDF</a>}
                      {declaration.customsRef && <p><span className="text-muted-foreground">Customs ref:</span> {declaration.customsRef}</p>}
                    </div>
                    {declaration.status === 'pending' && (
                      <div className="mt-3">
                        <SubmitArrivalButton
                          declarationId={declaration.id}
                          productName={declaration.productName}
                          expectedQuantity={declaration.expectedQuantity}
                        />
                      </div>
                    )}
                    {declaration.reviewerNote && (
                      <div className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-sm">
                        <span className="font-medium">RRA review note: </span>{declaration.reviewerNote}
                      </div>
                    )}
                    {declaration.status === 'rejected' && (
                      <p className="mt-2 text-xs text-red-700">Review the RRA note above, then contact RRA support if you need help updating this declaration.</p>
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
