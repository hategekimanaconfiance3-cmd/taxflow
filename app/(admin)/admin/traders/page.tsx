import { requireRRAPermission } from '@/lib/auth-guard';
import { TinTaxpayerLookup } from '@/components/admin/tin-taxpayer-lookup';

export default async function AdminTradersPage() {
  await requireRRAPermission("taxpayer.intelligence.search");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Taxpayer Workspace</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Search a TIN to review the taxpayer records available to your verified RRA permissions.
        </p>
      </div>
      <TinTaxpayerLookup />
    </div>
  );
}
