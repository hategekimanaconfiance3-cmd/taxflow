import { requireApprovedClearance } from '@/lib/auth-guard';
import { getOutgoingTransactions } from '@/lib/actions/transaction.action';
import { FileDisputeForm } from '@/components/dashboard/dispute-form/file-dispute-form';

export default async function DisputesPage() {
  await requireApprovedClearance();

  const outgoing = await getOutgoingTransactions();

  // Only confirmed/completed transactions can be disputed
  const disputableTransactions = outgoing
    .filter((t) => ['confirmed', 'completed'].includes(t.status))
    .map((t) => ({
      id: t.id,
      productName: t.productName,
      quantity: t.quantity,
      totalAmount: Number(t.totalAmount),
      createdAt: t.createdAt instanceof Date
        ? t.createdAt.toISOString()
        : String(t.createdAt),
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">File a Dispute</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Raise a formal dispute against a confirmed transaction. Disputes are reviewed by RRA compliance officers.
        </p>
      </div>

      <FileDisputeForm transactions={disputableTransactions} />
    </div>
  );
}
