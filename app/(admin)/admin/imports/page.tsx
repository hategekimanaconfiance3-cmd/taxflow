import { AdminImportActions } from '@/components/admin/admin-import-actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAllImportDeclarations } from '@/lib/actions/import.action';
import { requireRRASession } from '@/lib/auth-guard';
import { Ship } from 'lucide-react';

export default async function AdminImportsPage() {
  await requireRRASession('compliance_officer', 'audit_officer');
  const declarations = await getAllImportDeclarations();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import Declarations</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Review, activate, and manage all trader import declarations.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Ship className="h-4 w-4" />
            Import Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          {declarations.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No import declarations have been submitted.
            </p>
          ) : (
            <div className="space-y-4">
              {declarations.map((declaration) => (
                <article
                  key={declaration.id}
                  className="grid gap-4 rounded-lg border p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                >
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-medium">{declaration.productName}</h2>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
                        {declaration.status}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {declaration.businessName ?? 'Unnamed business'}
                      {declaration.tinNumber ? ` · TIN ${declaration.tinNumber}` : ''}
                    </p>
                    <div className="text-muted-foreground grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                      <span>
                        Expected: {declaration.expectedQuantity.toLocaleString()} {declaration.productUnit}
                      </span>
                      <span>
                        Actual: {declaration.actualQuantity == null
                          ? 'Not submitted'
                          : `${declaration.actualQuantity.toLocaleString()} ${declaration.productUnit}`}
                      </span>
                      {declaration.customsRef && <span>Customs ref: {declaration.customsRef}</span>}
                      {declaration.originCountry && <span>Origin: {declaration.originCountry}</span>}
                      {declaration.invoiceRef && <span>Invoice: {declaration.invoiceRef}</span>}
                      <span>Declared {declaration.createdAt.toLocaleDateString()}</span>
                    </div>
                  </div>

                  {declaration.status === 'submitted' && declaration.actualQuantity != null ? (
                    <AdminImportActions
                      declarationId={declaration.id}
                      productName={declaration.productName}
                      expectedQuantity={declaration.expectedQuantity}
                      actualQuantity={declaration.actualQuantity}
                      invoiceRef={declaration.invoiceRef ?? ''}
                      supportingDoc={declaration.supportingDoc ?? ''}
                    />
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
