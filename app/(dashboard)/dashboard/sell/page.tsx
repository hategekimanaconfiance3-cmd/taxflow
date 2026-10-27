import { requireTraderSession } from '@/lib/auth-guard';
import { SellForm } from '@/components/dashboard/sell-form/sell-form';
import { getInventory } from '@/lib/actions/stock.action';
import { getSystemConfig } from '@/lib/actions/system-config.action';
import { getOutgoingTransactions } from '@/lib/actions/transaction.action';

export default async function SellPage() {
  const session = await requireTraderSession();

  // Only manufacturers and wholesalers can use the B2B sell form
  if (session.user.role === 'retailer') {
    // Retailers should use record-sale instead
    const { redirect } = await import('next/navigation');
    redirect('/dashboard/record-sale');
  }

  const [inventory, config, recentTransactions] = await Promise.all([getInventory(), getSystemConfig(), getOutgoingTransactions()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sell to Buyer</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Create a B2B transaction. Verify the buyer&apos;s TIN, select products, and send the transaction for confirmation.
        </p>
      </div>

      <SellForm inventory={inventory} vatRate={config.vatRate} recentTransactions={recentTransactions.slice(0, 8)} />
    </div>
  );
}
