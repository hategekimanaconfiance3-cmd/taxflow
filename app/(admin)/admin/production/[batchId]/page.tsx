import { notFound } from 'next/navigation';
import { requireRRAPermission } from '@/lib/auth-guard';
import { getProductionComplianceDetail } from '@/lib/production-service';
import { hasRRAPermission } from '@/lib/rra-rbac';
import { ConfidentialFormulaAccess } from '@/components/admin/confidential-formula-access';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function AdminProductionBatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { staff } = await requireRRAPermission('stock.read');
  const { batchId } = await params;
  const batch = await getProductionComplianceDetail(batchId);
  if (!batch) notFound();
  const canReadFormula = staff.clearanceRoles.some((role) => hasRRAPermission(role, 'production.recipe.confidential.read'));

  return <div className="space-y-5">
    <div><h1 className="text-2xl font-bold">Production batch {batch.batchReference}</h1><p className="text-sm text-muted-foreground">{batch.manufacturerName ?? 'Manufacturer'} · {batch.productName}</p></div>
    <Card><CardHeader><CardTitle>Compliance evidence</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
      <p>Planned output: <strong>{batch.plannedOutputQuantity == null ? 'Not recorded' : `${batch.plannedOutputQuantity.toLocaleString()} ${batch.productUnit}`}</strong> · Actual output: <strong>{batch.outputQuantity.toLocaleString()} {batch.productUnit}</strong></p>
      <p>Status: {batch.status ?? 'recorded'} · {batch.createdAt.toLocaleDateString()}</p>
      {batch.materials.length === 0 ? <p className="text-muted-foreground">No recipe-linked material records for this batch.</p> : <div className="space-y-2">{batch.materials.map((material) => {
        const variance = material.plannedQuantity > 0 ? ((material.actualQuantity - material.plannedQuantity) / material.plannedQuantity) * 100 : 0;
        return <div key={material.materialCode} className="grid gap-1 rounded-md border p-3 sm:grid-cols-4"><span className="font-mono">{material.materialCode}</span><span>Planned {material.plannedQuantity} {material.unit}</span><span>Actual {material.actualQuantity} {material.unit}</span><span>Variance {variance.toFixed(1)}%</span></div>;
      })}</div>}
    </CardContent></Card>
    {canReadFormula && batch.materials.length > 0 && <ConfidentialFormulaAccess batchId={batch.id} />}
  </div>;
}
