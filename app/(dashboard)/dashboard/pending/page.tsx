import { requireTraderSession } from '@/lib/auth-guard';
import { getIncomingTransactions, getOutgoingTransactions } from '@/lib/actions/transaction.action';
import { PendingPageClient } from '@/components/dashboard/pending-page/pending-page-client';

export default async function PendingPage() {
  await requireTraderSession();

  const [incoming, outgoing] = await Promise.all([
    getIncomingTransactions(),
    getOutgoingTransactions(),
  ]);

  return (
    <PendingPageClient incoming={incoming} outgoing={outgoing} />
  );
}
