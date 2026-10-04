import { requireTraderSession } from '@/lib/auth-guard';
import { getIncomingTransactions, getOutgoingTransactions } from '@/lib/actions/transaction.action';
import { PendingPageClient } from '@/components/dashboard/pending-page/pending-page-client';

export default async function PendingPage() {
  const session = await requireTraderSession();

  const [incoming, outgoing] = await Promise.all([
    getIncomingTransactions(),
    getOutgoingTransactions(),
  ]);

  const pendingIncoming = incoming.filter((t) => t.status === 'pending');
  const pendingOutgoing = outgoing.filter((t) => t.status === 'pending');

  return (
    <PendingPageClient
      userId={session.user.id}
      initialIncoming={pendingIncoming}
      initialOutgoing={pendingOutgoing}
    />
  );
}
