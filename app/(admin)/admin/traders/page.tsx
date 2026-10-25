import { requireRRAOperationalPermission } from '@/lib/auth-guard';
import { TinTaxpayerLookup } from '@/components/admin/tin-taxpayer-lookup';

export default async function AdminTradersPage() {
  await requireRRAOperationalPermission("taxpayer.intelligence.search");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Taxpayer Intelligence Search</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Search by TIN and review records and AI analysis available to your verified RRA permissions.
        </p>
      </div>
      <TinTaxpayerLookup />
    </div>
  );
}
