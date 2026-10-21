import { requireRRASession } from '@/lib/auth-guard';
import { TinTaxpayerLookup } from '@/components/admin/tin-taxpayer-lookup';

export default async function AdminTradersPage() {
  await requireRRASession("compliance_officer", "audit_officer", "tax_compliance_officer", "audit_investigation_officer");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Trader Self-Service Lookup</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Find a caller by TIN and review the information assigned to your RRA role.
        </p>
      </div>
      <TinTaxpayerLookup />
    </div>
  );
}
