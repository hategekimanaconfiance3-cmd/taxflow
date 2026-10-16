import { requireApprovedClearance } from '@/lib/auth-guard';
import { getProducts } from '@/lib/actions/stock.action';
import { getImportDeclarations } from '@/lib/actions/import.action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, Ship } from 'lucide-react';
import { ImportForm } from '@/components/dashboard/import-form/import-form';
import { SubmitArrivalButton } from '@/components/dashboard/import-form/confirm-arrival-button';

export default async function ImportsPage() {
  await requireApprovedClearance();

  const products = await getProducts();
  const declarations = await getImportDeclarations();
  const formProducts = products.map((p) => ({
    id: p.id,
    name: p.name,
    unit: p.unit,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">TaxFlow Smart Customs</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Declare goods you expect to bring into Rwanda, then track the official customs inspection and clearance status.
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
            <p className="py-4 text-center text-sm text-muted-foreground">Your declarations will appear here after you submit one.</p>
          ) : (
            <div className="divide-y">
              {declarations.map((d) => {
                const status = d.status === 'activated'
                  ? { label: 'Customs cleared', variant: 'default' as const }
                  : d.status === 'submitted'
                    ? { label: 'Awaiting customs inspection', variant: 'secondary' as const }
                    : d.status === 'rejected'
                      ? { label: 'Review required', variant: 'destructive' as const }
                      : { label: 'Draft / pending arrival', variant: 'outline' as const };
                return (
                  <div key={d.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <Ship className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-semibold">{d.productName}</p>
                          <p className="text-xs text-muted-foreground">
                            Expected: {d.expectedQuantity.toLocaleString()} {d.productUnit}
                            {d.originCountry ? ` · ${d.originCountry}` : ''}
                            {d.expectedReturnDate ? ` · Return by ${d.expectedReturnDate}` : ''}
                          </p>
                          {d.customsRef && <p className="mt-1 font-mono text-xs text-muted-foreground">Reference: {d.customsRef}</p>}
                        </div>
                      </div>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    {d.estimatedValue != null && (
                      <p className="pl-6 text-xs text-muted-foreground">Estimated value: {d.estimatedValue.toLocaleString()} {d.currency}</p>
                    )}
                    {d.actualQuantity != null && (
                      <p className="pl-6 text-xs text-muted-foreground">Merchant-reported arrival quantity: {d.actualQuantity.toLocaleString()} {d.productUnit}</p>
                    )}
                    {d.inspectedQuantity != null && (
                      <p className="pl-6 text-xs font-medium text-emerald-700">Customs-verified quantity: {d.inspectedQuantity.toLocaleString()} {d.productUnit}</p>
                    )}
                    {d.inspectionNote && <p className="pl-6 text-xs text-muted-foreground">Customs note: {d.inspectionNote}</p>}
                    {d.status === 'pending' && (
                      <div className="pl-6">
                        <SubmitArrivalButton
                          declarationId={d.id}
                          productName={d.productName}
                          expectedQuantity={d.expectedQuantity}
                        />
                      </div>
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
