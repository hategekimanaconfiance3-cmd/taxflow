import { requireTraderSession } from '@/lib/auth-guard';
import { SellForm } from '@/components/dashboard/sell-form/sell-form';
import { getInventory } from '@/lib/actions/stock.action';
import { getSystemConfig } from '@/lib/actions/system-config.action';

export default async function SellPage() {
  const session = await requireTraderSession();

  // Only manufacturers and wholesalers can use the B2B sell form
  if (session.user.role === 'retailer') {
    // Retailers should use record-sale instead
    const { redirect } = await import('next/navigation');
    redirect('/dashboard/record-sale');
  }

  const [inventory, config] = await Promise.all([getInventory(), getSystemConfig()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sell to Buyer</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Create a B2B transaction. Enter the buyer&apos;s TIN, select a product, and set the quantity and price.
        </p>
      </div>

      <SellForm inventory={inventory} vatRate={config.vatRate} />
    </div>
  );
}
