import { requireTraderSession } from '@/lib/auth-guard';
import { getIncomingTransactions, getOutgoingTransactions } from '@/lib/actions/transaction.action';
import { getB2BFulfillmentQueue } from '@/lib/actions/b2b-fulfillment.action';
import { PendingPageClient } from '@/components/dashboard/pending-page/pending-page-client';

export default async function PendingPage() {
  await requireTraderSession();

  const [incoming, outgoing, fulfillment] = await Promise.all([
    getIncomingTransactions(),
    getOutgoingTransactions(),
    getB2BFulfillmentQueue(),
  ]);

  return (
    <PendingPageClient incoming={incoming} outgoing={outgoing} fulfillment={fulfillment} />
  );
}
