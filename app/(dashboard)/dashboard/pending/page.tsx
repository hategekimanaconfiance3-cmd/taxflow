import { requireTraderSession } from '@/lib/auth-guard';
import { getIncomingTransactions, getOutgoingTransactions, getPurchaseEligibility } from '@/lib/actions/transaction.action';
import { getB2BFulfillmentQueue } from '@/lib/actions/b2b-fulfillment.action';
import { PendingPageClient } from '@/components/dashboard/pending-page/pending-page-client';

export default async function PendingPage() {
  await requireTraderSession();

  const [incoming, outgoing, fulfillment] = await Promise.all([
    getIncomingTransactions(),
    getOutgoingTransactions(),
    getB2BFulfillmentQueue(),
  ]);

  // Fetch purchase eligibility for every pending incoming transaction in parallel
  const pendingIds = incoming.filter((t) => t.status === 'pending').map((t) => t.id);
  const eligibilityEntries = await Promise.all(
    pendingIds.map(async (id) => [id, await getPurchaseEligibility(id)] as const),
  );
  const eligibilityMap = Object.fromEntries(eligibilityEntries.filter(([, v]) => v !== null));

  return (
    <PendingPageClient incoming={incoming} outgoing={outgoing} fulfillment={fulfillment} eligibilityMap={eligibilityMap} />
  );
}
