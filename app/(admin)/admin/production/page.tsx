import Link from 'next/link';
import { requireRRAPermission } from '@/lib/auth-guard';
import { listProductionComplianceRecords } from '@/lib/production-service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function AdminProductionPage() {
  await requireRRAPermission('traceability.read');
  const batches = await listProductionComplianceRecords();
  return <div className="space-y-5">
    <div><h1 className="text-2xl font-bold">Production monitoring</h1><p className="text-sm text-muted-foreground">Review declared output and protected material usage evidence. Ingredient names require separate audited access.</p></div>
    <Card><CardHeader><CardTitle>Recent production batches</CardTitle></CardHeader><CardContent className="space-y-2">
      {batches.length === 0 ? <p className="text-sm text-muted-foreground">No production batches recorded.</p> : batches.map((batch) => <Link key={batch.id} href={`/admin/production/${encodeURIComponent(batch.id)}`} className="grid gap-2 rounded-md border p-3 text-sm hover:bg-muted/40 sm:grid-cols-5">
        <span className="font-mono">{batch.batchReference}</span><span>{batch.manufacturerName ?? 'Manufacturer'}</span><span>{batch.productName}</span><span>{batch.outputQuantity.toLocaleString()}</span><span>{batch.status ?? 'recorded'} · {batch.createdAt.toLocaleDateString()}</span>
      </Link>)}
    </CardContent></Card>
  </div>;
}
