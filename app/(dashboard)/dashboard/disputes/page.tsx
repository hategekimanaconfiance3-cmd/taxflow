import { requireApprovedClearance } from '@/lib/auth-guard';
import { getDisputableTransactions } from '@/lib/actions/dispute.action';
import { FileDisputeForm } from '@/components/dashboard/dispute-form/file-dispute-form';

export default async function DisputesPage() {
  await requireApprovedClearance();

  const disputableTransactions = await getDisputableTransactions();

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
