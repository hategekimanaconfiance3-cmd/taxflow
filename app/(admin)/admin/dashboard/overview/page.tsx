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
import { RoleWorkspace } from '@/components/admin/role-workspace';
import { hasOperationalRRAPermission, hasRRAPermission } from '@/lib/rra-rbac';
import { getSuperAdminCommandCenter } from '@/lib/actions/super-admin-command-center.action';
import { SuperAdminCommandCenter } from '@/components/admin/super-admin-command-center';
import type { SuperAdminDashboardComparison, SuperAdminDashboardPeriod } from '@/lib/super-admin-command-center';

const periods = ['today', '7d', '30d', '90d', 'custom'] as const;
const comparisons = ['previous_period', 'previous_month', 'previous_year'] as const;

export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, staff } = await requireRRASession();
  const roles = staff.clearanceRoles;
  const params = await searchParams;
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const period = periods.find((value) => value === first(params.period)) ?? '30d';
  const comparison = comparisons.find((value) => value === first(params.comparison)) ?? 'previous_period';

  if (roles.includes('super_admin')) {
    let data: Awaited<ReturnType<typeof getSuperAdminCommandCenter>> | null = null;
    let error: string | null = null;
    try {
      data = await getSuperAdminCommandCenter({ period, comparison, from: first(params.from), to: first(params.to) });
    } catch (caught) {
      console.error('Super Admin command center failed to load', { errorName: caught instanceof Error ? caught.name : typeof caught });
      error = caught instanceof Error ? caught.message : 'Command center data is temporarily unavailable. Please retry.';
    }
    return <SuperAdminCommandCenter data={data} error={error} period={period as SuperAdminDashboardPeriod} comparison={comparison as SuperAdminDashboardComparison} from={first(params.from)} to={first(params.to)} />;
  }

  const canViewAggregateDashboard = roles.some((role) => hasRRAPermission(role, "reports.aggregate.read"));
  const canSearchTaxpayers = hasOperationalRRAPermission(roles, "taxpayer.intelligence.search");
  const canViewTransactionDetails = hasOperationalRRAPermission(roles, "transaction.read");
  const canViewImportDetails = hasOperationalRRAPermission(roles, "imports.read") || hasOperationalRRAPermission(roles, "imports.review");
  const canViewDisputeDetails = hasOperationalRRAPermission(roles, "investigation.case.manage");
  const canViewPaymentDetails = hasOperationalRRAPermission(roles, "payments.read") || hasOperationalRRAPermission(roles, "payments.reconcile");

  if (!canViewAggregateDashboard) {
    return (
      <div className="space-y-6">
        {canSearchTaxpayers && <TinTaxpayerLookup />}
        <RoleWorkspace roles={roles} />
      </div>
    );
  }

  const stats = await getDashboardOverview();

  // Build priority alerts from live stats
  const alerts: PriorityAlert[] = [];

  if (stats.traders.suspended > 0) {
    alerts.push({
      id: 'suspended',
      severity: 'critical',
      message: `${stats.traders.suspended} trader${stats.traders.suspended !== 1 ? 's' : ''} suspended`,
      href: canSearchTaxpayers ? '/admin/traders' : undefined,
    });
  }
  if (stats.disputes.underReview > 0) {
    alerts.push({
      id: 'disputes',
      severity: 'warning',
      message: `${stats.disputes.underReview} dispute${stats.disputes.underReview !== 1 ? 's' : ''} under review`,
      href: canViewDisputeDetails ? '/admin/disputes' : undefined,
    });
  }
  if (stats.imports.submitted > 0) {
    alerts.push({
      id: 'imports',
      severity: 'info',
      message: `${stats.imports.submitted} import${stats.imports.submitted !== 1 ? 's' : ''} awaiting activation`,
      href: canViewImportDetails ? '/admin/imports' : undefined,
    });
  }
  if (stats.revenue.outstanding > 500000) {
    alerts.push({
      id: 'outstanding',
      severity: 'warning',
      message: `${formatRWF(stats.revenue.outstanding)} VAT outstanding`,
      href: canViewPaymentDetails ? '/admin/payments' : undefined,
    });
  }

  const completionRate =
    stats.revenue.vatOutput > 0
      ? Math.round((stats.revenue.taxPaymentsTotal / stats.revenue.vatOutput) * 100)
      : 0;

  const cleared = Number(stats.traders.byClearance?.['approved'] ?? 0);
  const flagged = Number(stats.traders.byClearance?.['flagged'] ?? 0);
  const suspended = Number(stats.traders.suspended ?? 0);

  return (
    <div className="space-y-5">
      {canSearchTaxpayers && <TinTaxpayerLookup />}

      {/* Priority alerts */}
      {alerts.length > 0 && <PriorityAlerts alerts={alerts} />}

      {/* Live EBM pulse + velocity gauge */}
      {canViewTransactionDetails && <CommandCenterHero
        userId={user.id}
        todayCount={Number(stats.transactions.today.count) || 0}
        todayValue={Number(stats.transactions.today.value) || 0}
        weekCount={Number(stats.transactions.thisWeek.count) || 0}
        weekValue={Number(stats.transactions.thisWeek.value) || 0}
      />}

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCardSparkline
          title="VAT Generated (Output)"
          value={formatRWF(stats.revenue.vatOutput)}
          description="Total output VAT recorded"
          trend={stats.trends.vatGenerated}
          icon={<DollarSign className="h-4 w-4" />}
          sparkKey="vatGenerated"
          sparkColor="#10b981"
        />
        <KpiCardSparkline
          title="VAT Collected"
          value={formatRWF(stats.revenue.taxPaymentsTotal)}
          description={`${stats.revenue.taxPaymentsCount} payment${stats.revenue.taxPaymentsCount !== 1 ? 's' : ''} received`}
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
      {(canViewTransactionDetails || canViewImportDetails || canViewPaymentDetails) && <StreamingTicker userId={user.id} />}
    </div>
  );
}
