import { requireRRAPermission } from '@/lib/auth-guard';
import { listPendingProductionBatchReviews, listPendingProductionMaterialReceipts } from '@/lib/material-accounting-service';
import { hasRRAPermission } from '@/lib/rra-rbac';
import { ProductionMaterialReviewQueue } from '@/components/admin/production-material-review-queue';

export default async function ProductionMaterialAccountingPage({ searchParams }: { searchParams: Promise<{ batchId?: string }> }) {
  const { batchId } = await searchParams;
  const { staff } = await requireRRAPermission('production.material.receipt.review');
  const canReviewBatches = staff.clearanceRoles.some((role) => hasRRAPermission(role, 'production.batch.review'));
  const [receipts, batches] = await Promise.all([
    listPendingProductionMaterialReceipts(),
    canReviewBatches ? listPendingProductionBatchReviews(batchId) : Promise.resolve([]),
  ]);
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold tracking-tight">Manufacturing Material Review</h1><p className="mt-1 text-sm text-muted-foreground">Verify physical receipt evidence and review held production. Protected material names are not available in this queue.</p></div>
    <ProductionMaterialReviewQueue receipts={receipts} batches={batches} canReviewBatches={canReviewBatches} focusBatchId={batchId ?? null} />
  </div>;
}
