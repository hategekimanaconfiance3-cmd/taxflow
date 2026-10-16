import { requireRRASession } from '@/lib/auth-guard';
import { getAllImportDeclarations } from '@/lib/actions/import.action';
import { AdminImportActions } from '@/components/admin/admin-import-actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Ship, Package, ClipboardList } from 'lucide-react';

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending:   { label: 'Pending',   variant: 'secondary' },
  submitted: { label: 'Submitted', variant: 'default' },
  activated: { label: 'Customs cleared', variant: 'outline' },
  rejected:  { label: 'Rejected',  variant: 'destructive' },
};

export default async function AdminImportsPage() {
  await requireRRASession('compliance_officer', 'audit_officer');

  const declarations = await getAllImportDeclarations();
  const submitted = declarations.filter((d) => d.status === 'submitted');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Customs Verification</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Review merchant pre-travel declarations, record the quantity physically inspected, and confirm customs clearance. Only authorized RRA officers can finalize a declaration.
        </p>
      </div>

      {/* ── Pending Review ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Ship className="h-4 w-4" />
            Awaiting RRA Review
            {submitted.length > 0 && (
              <Badge variant="default" className="ml-auto">
                {submitted.length} pending
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {submitted.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No declarations awaiting review.
            </p>
          ) : (
            <div className="divide-y">
              {submitted.map((d) => (
                <div key={d.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="text-xs text-muted-foreground mb-2">
                      <span className="font-medium text-foreground">{d.businessName}</span>
                      {d.tinNumber && <span className="ml-2 font-mono">TIN: {d.tinNumber}</span>}
                      {d.originCountry && <span className="ml-2">· {d.originCountry}</span>}
                      {d.supplierName && <span className="ml-2">· Supplier: {d.supplierName}</span>}
                      {d.expectedReturnDate && <span className="ml-2">· Return: {d.expectedReturnDate}</span>}
                      {d.estimatedValue != null && <span className="ml-2">· Est. value: {d.estimatedValue.toLocaleString()} {d.currency}</span>}
                      {d.customsRef && <span className="ml-2">· Ref: {d.customsRef}</span>}
                    </div>
                  </div>
                  {/* Correctly mapped component with all required properties */}
                  <AdminImportActions
                    declarationId={d.id}
                    productName={`${d.productName} (${d.productUnit})`}
                    expectedQuantity={d.expectedQuantity}
                    actualQuantity={d.actualQuantity ?? d.expectedQuantity}
                    supplierName={d.supplierName ?? undefined}
                    originCountry={d.originCountry ?? undefined}
                    expectedReturnDate={d.expectedReturnDate ?? undefined}
                    estimatedValue={d.estimatedValue}
                    currency={d.currency}
                    invoiceRef={d.invoiceRef ?? ''}
                    supportingDoc={d.supportingDoc ?? ''}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── All Declarations ───────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            All Declarations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {declarations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No import declarations on record.
            </p>
          ) : (
            <div className="divide-y">
              {declarations.map((d) => {
                const badge = STATUS_BADGE[d.status] ?? { label: d.status, variant: 'secondary' as const };
                return (
                  <div key={d.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{d.productName}</p>
                        <p className="text-xs text-muted-foreground">
                          {d.businessName} · Expected: {d.expectedQuantity.toLocaleString()} {d.productUnit}
                          {d.actualQuantity != null && ` · Merchant reported: ${d.actualQuantity.toLocaleString()} ${d.productUnit}`}
                          {d.inspectedQuantity != null && ` · Customs inspected: ${d.inspectedQuantity.toLocaleString()} ${d.productUnit}`}
                        </p>
                      </div>
                    </div>
                    <Badge variant={badge.variant} className="shrink-0 text-xs">
                      {badge.label}
                    </Badge>
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
