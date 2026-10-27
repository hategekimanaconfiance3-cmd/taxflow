import { CustomerDirectory } from '@/components/dashboard/customers/customer-directory';
import { getBusinessCustomers } from '@/lib/actions/customer.action';
import { requireTraderSession } from '@/lib/auth-guard';

export default async function CustomersPage() {
  await requireTraderSession();
  const customers = await getBusinessCustomers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">Keep business-owned customer details for reuse on retail sales. Saved records do not verify identity or RRA registration.</p>
      </div>
      <CustomerDirectory customers={customers} />
    </div>
  );
}
