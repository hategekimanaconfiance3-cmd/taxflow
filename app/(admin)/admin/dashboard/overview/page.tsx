import { requireRRASession } from '@/lib/auth-guard';
import { getDashboardOverview } from '@/lib/actions/admin-dashboard.action';
import { CommandCenterHero } from '@/components/admin/overview/command-center-hero';
import { KpiCardSparkline } from '@/components/admin/overview/kpi-card-sparkline';
import { PriorityAlerts } from '@/components/admin/overview/priority-alerts';
import { StreamingTicker } from '@/components/admin/overview/streaming-ticker';
import { TaxOpsCompact } from '@/components/admin/overview/tax-ops-compact';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';
import { TrendingUp, Users, DollarSign } from 'lucide-react';
import type { PriorityAlert } from '@/components/admin/overview/priority-alerts';
import { TinTaxpayerLookup } from '@/components/admin/tin-taxpayer-lookup';
import { hasRRAPermission } from '@/lib/rra-rbac';

export default async function AdminOverviewPage() {
  const { user, staff } = await requireRRASession("compliance_officer", "audit_officer", "reporting_officer", "director_executive", "tax_compliance_officer", "audit_investigation_officer", "data_ai_analyst", "super_admin", "payments_reconciliation_officer", "product_traceability_officer", "customs_import_officer");
  const stats = await getDashboardOverview();
  const canSearchTaxpayers = staff.clearanceRoles.some((role) => hasRRAPermission(role, "taxpayer.intelligence.search"));

  // Build priority alerts from live stats
  const alerts: PriorityAlert[] = [];

  if (stats.traders.suspended > 0) {
    alerts.push({
      id: 'suspended',
      severity: 'critical',
      message: `${stats.traders.suspended} trader${stats.traders.suspended !== 1 ? 's' : ''} suspended`,
      href: '/admin/traders',
    });
  }
  if (stats.disputes.underReview > 0) {
    alerts.push({
      id: 'disputes',
      severity: 'warning',
      message: `${stats.disputes.underReview} dispute${stats.disputes.underReview !== 1 ? 's' : ''} under review`,
      href: '/admin/disputes',
    });
  }
  if (stats.imports.submitted > 0) {
    alerts.push({
      id: 'imports',
      severity: 'info',
      message: `${stats.imports.submitted} import${stats.imports.submitted !== 1 ? 's' : ''} awaiting activation`,
      href: '/admin/imports',
    });
  }
  if (stats.revenue.outstanding > 500000) {
    alerts.push({
      id: 'outstanding',
      severity: 'warning',
      message: `${formatRWF(stats.revenue.outstanding)} VAT outstanding`,
      href: '/admin/payments',
    });
  }

  // Calculate net VAT due (output - input). If net > 0, calculate payment coverage.
  const netVatDue = Math.max(0, stats.revenue.vatOutput - stats.revenue.vatInput);
  const completionRate = netVatDue > 0
    ? Math.min(Math.round((stats.revenue.taxPaymentsTotal / netVatDue) * 100), 999)
    : stats.revenue.taxPaymentsTotal > 0 ? 100 : 0;

  const cleared = Number(stats.traders.byClearance?.['approved'] ?? 0);
  const flagged = Number(stats.traders.byClearance?.['under_review'] ?? 0);
  const suspended = Number(stats.traders.suspended ?? 0);

  return (
    <div className="space-y-5">
      {canSearchTaxpayers && <TinTaxpayerLookup />}

      {/* Priority alerts */}
      {alerts.length > 0 && <PriorityAlerts alerts={alerts} />}

      {/* Live transaction flow + today glance */}
      <CommandCenterHero
        userId={user.id}
        todayCount={Number(stats.transactions.today.count) || 0}
        todayValue={Number(stats.transactions.today.value) || 0}
        weekCount={Number(stats.transactions.thisWeek.count) || 0}
        weekValue={Number(stats.transactions.thisWeek.value) || 0}
        pendingDisputes={stats.disputes.underReview}
      />

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCardSparkline
          title="Recorded Output VAT"
          value={formatRWF(stats.revenue.vatOutput)}
          description="Total output VAT recorded"
          trend={stats.trends.vatGenerated}
          icon={<DollarSign className="h-4 w-4" />}
          sparkKey="vatGenerated"
          sparkColor="#10b981"
        />
        <KpiCardSparkline
          title="Confirmed Tax Payments"
          value={formatRWF(stats.revenue.taxPaymentsTotal)}
          description={`${stats.revenue.taxPaymentsCount} confirmed payment${stats.revenue.taxPaymentsCount !== 1 ? 's' : ''} · ${stats.revenue.vatInput > 0 ? `Input: ${formatRWF(stats.revenue.vatInput)}` : 'No input VAT recorded'}`}
          trend={stats.trends.vatCollected}
          icon={<TrendingUp className="h-4 w-4" />}
          sparkKey="vatCollected"
          sparkColor="#6366f1"
        />
        <KpiCardSparkline
          title="Total Transactions"
          value={stats.transactions.total.toLocaleString()}
          description={`${formatRWF(stats.transactions.totalValue)} total value`}
          trend={stats.trends.transactions}
          icon={<Users className="h-4 w-4" />}
          sparkKey="transactions"
          sparkColor="#f59e0b"
        />
      </div>

      {/* Tax collection + operations summary */}
      <TaxOpsCompact
        tax={{
          completionRate,
          collected: stats.revenue.taxPaymentsTotal,
          outstanding: Math.max(stats.revenue.outstanding, 0),
          paymentsCount: stats.revenue.taxPaymentsCount,
        }}
        ops={{
          pendingTxns: stats.transactions.pending,
          importsToReview: stats.imports.submitted,
          disputesToReview: stats.disputes.underReview,
          cleared,
          flagged,
          suspended,
        }}
      />

      {/* Live streaming ticker */}
      <StreamingTicker userId={user.id} />
    </div>
  );
}
