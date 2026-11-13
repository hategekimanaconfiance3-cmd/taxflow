import { requireRRASession } from '@/lib/auth-guard';
import { getAllImportDeclarations } from '@/lib/actions/import.action';
import { AdminImportActions } from '@/components/admin/admin-import-actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Ship, Package, ClipboardList } from 'lucide-react';

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending:   { label: 'Awaiting inspection', variant: 'secondary' },
  submitted: { label: 'Awaiting inspection', variant: 'default' },
  activated: { label: 'Activated', variant: 'outline' },
  rejected:  { label: 'Rejected',  variant: 'destructive' },
};

export default async function AdminImportsPage() {
  const { staff } = await requireRRASession("compliance_officer", "audit_officer", "customs_import_officer", "super_admin");
  const canInspectImports = staff.clearanceRoles.some((role) => role === "customs_import_officer" || role === "super_admin");

  const declarations = await getAllImportDeclarations();
  const submitted = declarations.filter((d) => d.status === 'pending' || d.status === 'submitted');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import Declarations</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Review trader pre-declarations, record the physical inspection, and approve verified arrivals.
        </p>
      </div>

      {!canInspectImports && (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Read-only view. A staff account needs the Customs &amp; Import Officer role to record inspected quantities, approve or reject declarations, or delete unreviewed declarations.
        </p>
      )}

      {/* ── Pending Review ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Ship className="h-4 w-4" />
            Awaiting Customs Physical Inspection
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
                      {d.customsRef && <span className="ml-2">· Customs: {d.customsRef}</span>}
                    </div>
                  </div>
                  {canInspectImports ? (
                    <AdminImportActions
                      declarationId={d.id}
                      productName={`${d.productName} (${d.productUnit})`}
                      expectedQuantity={d.expectedQuantity}
                      invoiceRef={d.invoiceRef ?? ''}
                      supportingDoc={d.supportingDoc ?? ''}
                      materialCode={d.materialCode}
                    />
                  ) : (
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p>Expected: {d.expectedQuantity.toLocaleString()} {d.productUnit} · Awaiting Customs physical inspection.</p>
                      {d.invoiceRef && <p>Invoice reference: {d.invoiceRef}</p>}
                      {d.supportingDoc?.startsWith('/api/import-invoice/') && <a className="text-primary underline" href={d.supportingDoc} target="_blank" rel="noreferrer">View supporting invoice</a>}
                    </div>
                  )}
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
                          {d.inspectedQuantity != null && ` · TF verified: ${d.inspectedQuantity.toLocaleString()} ${d.productUnit}`}
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
