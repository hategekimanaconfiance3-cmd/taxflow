import { requireRRAOperationalPermission } from '@/lib/auth-guard';
import { TinTaxpayerLookup } from '@/components/admin/tin-taxpayer-lookup';
import { TraderDirectory } from '@/components/admin/trader-directory';
import { getTraderDirectoryFilterOptions } from '@/lib/actions/admin-trader-directory.action';
import { hasOperationalRRAPermission, type RRAPermission } from '@/lib/rra-rbac';

export default async function AdminTradersPage() {
  const { staff } = await requireRRAOperationalPermission("taxpayer.intelligence.search");
  const roles = staff.clearanceRoles;
  const has = (permission: RRAPermission) => hasOperationalRRAPermission(roles, permission);
  const capabilities = {
    location: has("taxpayer.compliance.read"),
    transactions: has("transaction.read"),
    stock: has("stock.read") || has("traceability.read"),
    production: has("traceability.read"),
    risk: has("ai.findings.read"),
  };
  let provinces: string[] = [];
  let locationError = "";
  if (capabilities.location) {
    try {
      provinces = await getTraderDirectoryFilterOptions({ level: "province" });
    } catch (error) {
      console.error("Could not load taxpayer directory locations", { errorName: error instanceof Error ? error.name : typeof error });
      locationError = "Location filters could not load. Retry the location lookup or continue with other filters.";
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Taxpayer Intelligence Search</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Search taxpayers, combine authorized filters, and open the existing TIN intelligence record.
        </p>
      </div>
      <TraderDirectory provinces={provinces} capabilities={capabilities} initialLocationError={locationError} />
      <TinTaxpayerLookup />
    </div>
  );
}
