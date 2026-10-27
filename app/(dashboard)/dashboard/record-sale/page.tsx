import { requireTraderSession } from '@/lib/auth-guard';
import { RecordSaleForm } from '@/components/dashboard/record-sale/record-sale-form';
import { getInventory } from '@/lib/actions/stock.action';
import { getBusinessCustomers } from '@/lib/actions/customer.action';
import { getSystemConfig } from '@/lib/actions/system-config.action';

export default async function RecordSalePage() {
  const session = await requireTraderSession();

  if (session.user.role !== 'retailer') {
    const { redirect } = await import('next/navigation');
    redirect('/dashboard/sell');
  }

  const [inventory, config, customerRows] = await Promise.all([getInventory(), getSystemConfig(), getBusinessCustomers(false)]);
  const customers = customerRows.map(({ id, name, tinNumber }) => ({ id, name, tinNumber }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Record Retail Sale</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Record a direct consumer sale. Stock is deducted immediately and VAT is computed automatically.
        </p>
      </div>

      <RecordSaleForm inventory={inventory} customers={customers} vatRate={config.vatRate} />
    </div>
  );
}
