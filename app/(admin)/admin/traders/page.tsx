import { requireRRASession } from '@/lib/auth-guard';
import { getTaxpayerOverview } from '@/lib/actions/admin-taxpayer-overview.action';
import { AdminTaxpayerTable } from '@/components/admin/admin-taxpayer-table';

export default async function AdminTradersPage() {
  await requireRRASession();

  const { rows, pagination, summary } = await getTaxpayerOverview(1, 'name', 'asc');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Traders</h1>
        <p className="text-muted-foreground text-sm mt-1">
          All registered manufacturers, wholesalers, and retailers with compliance metrics.
        </p>
      </div>

      <AdminTaxpayerTable
        initialRows={rows}
        initialPagination={pagination}
        initialSummary={summary}
      />
    </div>
  );
}
