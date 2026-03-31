import { requireRRASession } from '@/lib/auth-guard';
import { getDashboardOverview } from '@/lib/actions/admin-dashboard.action';
import { getTaxpayerOverview, getComplianceAlerts } from '@/lib/actions/admin-taxpayer-overview.action';
import { StatCard, formatRWF } from '@/components/dashboard/stat-card/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Users,
  Receipt,
  Building,
  Shield,
  TrendingUp,
  AlertTriangle,
  Ship,
  ArrowLeftRight,
  Activity,
  Scale,
  Clock,
  Banknote,
  ArrowRight,
  CheckCircle,
  XCircle,
  CreditCard,
} from 'lucide-react';
import Link from 'next/link';
import { AdminDashboardTabs } from '@/components/admin/admin-dashboard-tabs';
import { AdminDashboardSearch } from '@/components/admin/admin-dashboard-search';
import { RevenueForecastChart } from '@/components/admin/revenue-forecast-chart';
import { AuditRecommendations } from '@/components/admin/audit-recommendations';
import { AdminRealtimeWrapper } from '@/components/admin/admin-realtime-wrapper';
import { AdminTaxpayerTable } from '@/components/admin/admin-taxpayer-table';
import { AdminAlertsPanel } from '@/components/admin/admin-alerts-panel';
import { RegisterTaxpayerDialog } from '@/components/admin/register-taxpayer-dialog';
import { AdminBulkNotifyDialog } from '@/components/admin/admin-bulk-notify-dialog';
import { VATReturnDialog } from '@/components/admin/vat-return-dialog';
import { ExportTaxpayerCSV } from '@/components/admin/admin-export';
import { getAllTraders } from '@/lib/actions/admin.action';
import { TimeFilter } from '@/components/admin/time-filter';
import { ComplianceRiskHeatmap } from '@/components/admin/compliance-risk-heatmap';
import { ComplianceTrendChart } from '@/components/admin/compliance-trend-chart';
import { TaxGapDashboard } from '@/components/admin/tax-gap-dashboard';
import { SuspiciousPricingCard } from '@/components/admin/suspicious-pricing-card';
import { SmartAlertsPanel } from '@/components/admin/smart-alerts-panel';
import { SupplyChainMonitor } from '@/components/admin/supply-chain-monitor';
import { AuditPriorityQueue } from '@/components/admin/audit-priority-queue';
import { TraderRiskPanel } from '@/components/admin/trader-risk-panel';
import { EconomicIntelligence } from '@/components/admin/economic-intelligence';
import { Suspense } from 'react';

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { user, staff } = await requireRRASession();
  const params = await searchParams;

  // Parse date range from URL search params
  const from = params.from ? new Date(params.from + 'T00:00:00') : undefined;
  const to = params.to ? new Date(params.to + 'T23:59:59') : undefined;

  const [data, taxpayerData, alerts, traders] = await Promise.all([
    getDashboardOverview(from, to),
    getTaxpayerOverview(1, 'name', 'asc'),
    getComplianceAlerts(),
    getAllTraders(),
  ]);

  const complianceRate =
    data.revenue.vatOutput > 0 ? Math.round((data.revenue.taxPaymentsTotal / data.revenue.vatOutput) * 100) : 0;
  const progressBarPct = Math.min(complianceRate, 100);

  return (
    <AdminRealtimeWrapper userId={user.id}>
      <div className="space-y-6">
        {/* Header + Search */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">RRA Command Center</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {staff.department ?? 'General'} department ·{' '}
              <span className="font-mono text-xs">
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Suspense fallback={null}>
              <TimeFilter />
            </Suspense>
            <AdminDashboardSearch />
          </div>
        </div>

        {/* ── ACTION ITEMS — urgent items ────────────────────── */}
        {(data.imports.submitted > 0 || data.disputes.underReview > 0) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.imports.submitted > 0 && (
              <Link href="/admin/imports">
                <Card className="border-amber-200 bg-amber-50/40 hover:bg-amber-50/60 transition-colors cursor-pointer">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                          <Ship className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-amber-900">
                            {data.imports.submitted} Import
                            {data.imports.submitted !== 1 ? 's' : ''} Awaiting Approval
                          </p>
                          <p className="text-xs text-amber-700/70">
                            Traders submitted arrival details — review invoices & confirm
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-amber-500" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}
            {data.disputes.underReview > 0 && (
              <Link href="/admin/disputes">
                <Card className="border-blue-200 bg-blue-50/40 hover:bg-blue-50/60 transition-colors cursor-pointer">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                          <Scale className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-blue-900">
                            {data.disputes.underReview} Dispute
                            {data.disputes.underReview !== 1 ? 's' : ''} Ready for Review
                          </p>
                          <p className="text-xs text-blue-700/70">Both parties responded — issue RRA decision</p>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-blue-500" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}
          </div>
        )}

        {/* ── KEY METRICS ──────────────────────────────────── */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
          <StatCard
            title="Registered Traders"
            value={data.traders.total}
            description={`${data.traders.byRole['manufacturer'] ?? 0} mfr · ${data.traders.byRole['wholesaler'] ?? 0} whl · ${data.traders.byRole['retailer'] ?? 0} ret`}
            icon={<Users className="h-4 w-4" />}
          />
          <StatCard
            title="Total Taxes Generated"
            value={formatRWF(data.revenue.vatOutput)}
            description="System-wide output VAT"
            icon={<Receipt className="h-4 w-4" />}
            trend={data.trends.vatGenerated}
          />
          <StatCard
            title="Total VAT Collected"
            value={formatRWF(data.revenue.taxPaymentsTotal)}
            description={`Net due: ${formatRWF(data.revenue.netVatDue)}`}
            icon={<Building className="h-4 w-4" />}
            trend={data.trends.vatCollected}
          />
          <StatCard
            title="Pending Payments"
            value={formatRWF(alerts.pendingPayments.total)}
            description={`${alerts.pendingPayments.count} pending payments`}
            icon={<CreditCard className="h-4 w-4" />}
          />
          <StatCard
            title="Total Transactions"
            value={data.transactions.total.toLocaleString()}
            description={formatRWF(data.transactions.totalValue) + ' total value'}
            icon={<ArrowLeftRight className="h-4 w-4" />}
            trend={data.trends.transactions}
          />
        </div>

        {/* ── LIVE ACTIVITY + REVENUE ──────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Today's Snapshot */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-500" />
                Today&apos;s Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-3xl font-bold tracking-tight">{data.transactions.today.count}</p>
                <p className="text-xs text-muted-foreground">transactions today</p>
              </div>
              <div className="text-sm">
                <span className="font-mono font-semibold">{formatRWF(data.transactions.today.value)}</span>
                <span className="text-muted-foreground ml-1">value</span>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">This Week</p>
                  <p className="font-semibold">{data.transactions.thisWeek.count}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {formatRWF(data.transactions.thisWeek.value)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">New Traders</p>
                  <p className="font-semibold">{data.traders.newThisWeek}</p>
                  <p className="text-xs text-muted-foreground">this week</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tax Collection */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Banknote className="h-4 w-4 text-emerald-500" />
                Tax Collection
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-3xl font-bold tracking-tight">{complianceRate}%</p>
                <p className="text-xs text-muted-foreground">collection rate · collected ÷ expected VAT</p>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-muted rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all ${
                    complianceRate >= 90 ? 'bg-emerald-500' : complianceRate >= 70 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{
                    width: `${progressBarPct}%`,
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Collected</p>
                  <p className="font-mono font-semibold text-emerald-600">{formatRWF(data.revenue.taxPaymentsTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Outstanding</p>
                  <p className="font-mono font-semibold text-red-600">
                    {formatRWF(Math.max(data.revenue.outstanding, 0))}
                  </p>
                </div>
              </div>
              <Separator />
              <div className="text-xs text-muted-foreground">
                {data.revenue.taxPaymentsCount} payment
                {data.revenue.taxPaymentsCount !== 1 ? 's' : ''} received
              </div>
            </CardContent>
          </Card>

          {/* Operations Overview */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Shield className="h-4 w-4 text-violet-500" />
                Operations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Transaction status breakdown */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 text-amber-500" />
                    Pending Txns
                  </span>
                  <Badge variant="secondary" className="bg-amber-500/10 text-amber-600">
                    {data.transactions.pending}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Ship className="h-3.5 w-3.5 text-violet-500" />
                    Imports to Review
                  </span>
                  <Badge variant="secondary" className="bg-violet-500/10 text-violet-600">
                    {data.imports.submitted}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Scale className="h-3.5 w-3.5 text-blue-500" />
                    Disputes to Review
                  </span>
                  <Badge variant="secondary" className="bg-blue-500/10 text-blue-600">
                    {data.disputes.underReview}
                  </Badge>
                </div>
              </div>
              <Separator />
              {/* Clearance status */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Trader Compliance</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                    Cleared
                  </span>
                  <span className="font-semibold">{data.traders.byClearance['cleared'] ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    Flagged
                  </span>
                  <span className="font-semibold text-amber-600">{data.traders.flagged}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5">
                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                    Suspended
                  </span>
                  <span className="font-semibold text-red-600">{data.traders.suspended}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── AI REVENUE FORECAST ───────────────────────── */}
        <RevenueForecastChart />

        {/* ── INTELLIGENCE: Risk Heatmap + Suspicious Pricing ── */}
        <div className="grid gap-4 lg:grid-cols-2">
          <ComplianceRiskHeatmap />
          <SuspiciousPricingCard />
        </div>

        {/* ── INTELLIGENCE: Tax Gap + Compliance Trend ──── */}
        <div className="grid gap-4 lg:grid-cols-2">
          <TaxGapDashboard />
          <ComplianceTrendChart />
        </div>

        {/* ── INTELLIGENCE: Supply Chain + Audit Queue ──── */}
        <div className="grid gap-4 lg:grid-cols-2">
          <SupplyChainMonitor />
          <AuditPriorityQueue />
        </div>

        {/* ── ADVANCED: Trader Risk Panel + Economic Intel ─ */}
        <div className="grid gap-4 lg:grid-cols-2">
          <TraderRiskPanel />
          <EconomicIntelligence />
        </div>

        {/* ── AI AUDIT RECOMMENDATIONS ────────────────────── */}
        <AuditRecommendations />

        {/* ── SMART ALERTS ───────────────────────────────── */}
        <SmartAlertsPanel />

        {/* ── TAXPAYER OVERVIEW + ALERTS ─────────────────── */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <AdminTaxpayerTable
              initialRows={taxpayerData.rows}
              initialPagination={taxpayerData.pagination}
              initialSummary={taxpayerData.summary}
            />
          </div>
          <AdminAlertsPanel
            pendingPayments={alerts.pendingPayments}
            nonCompliantTraders={alerts.nonCompliantTraders}
            recentPayments={alerts.recentPayments}
          />
        </div>

        {/* ── RECENT ACTIVITY TABS ────────────────────────── */}
        <AdminDashboardTabs
          transactions={data.recent.transactions}
          imports={data.recent.imports}
          disputes={data.recent.disputes}
          audit={data.recent.audit}
        />

        {/* ── QUICK ACTIONS BAR ──────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-4">
          <RegisterTaxpayerDialog />
          <AdminBulkNotifyDialog />
          <VATReturnDialog traders={traders} />
          <ExportTaxpayerCSV rows={taxpayerData.rows} />
        </div>
      </div>
    </AdminRealtimeWrapper>
  );
}
