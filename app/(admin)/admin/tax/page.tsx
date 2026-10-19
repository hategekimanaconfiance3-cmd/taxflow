import { requireRRASession } from '@/lib/auth-guard';
import { TaxGapDashboard } from '@/components/admin/tax-gap-dashboard';

export default async function AdminTaxPage() {
  await requireRRASession("compliance_officer", "reporting_officer", "tax_compliance_officer", "payments_reconciliation_officer");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tax Gap Analysis</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Estimated tax gap between theoretical VAT liability and actual collections, broken down by sector and trader.
        </p>
      </div>

      <TaxGapDashboard />
    </div>
  );
}
