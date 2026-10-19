import { requireRRASession } from '@/lib/auth-guard';
import { SmartAlertsPanel } from '@/components/admin/smart-alerts-panel';

export default async function AdminComplianceAlertsPage() {
  await requireRRASession("compliance_officer", "tax_compliance_officer");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Compliance Alerts</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Automated compliance alerts: overdue VAT, pricing anomalies, and inactivity flags.
        </p>
      </div>

      <SmartAlertsPanel />
    </div>
  );
}
