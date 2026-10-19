import { requireRRASession } from '@/lib/auth-guard';
import { ComplianceOverview } from '@/components/admin/analytics/compliance-overview';

export default async function AdminCompliancePage() {
  await requireRRASession("compliance_officer", "tax_compliance_officer");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Compliance</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Trader compliance rates, VAT filing status, and enforcement metrics.
        </p>
      </div>

      <ComplianceOverview />
    </div>
  );
}
