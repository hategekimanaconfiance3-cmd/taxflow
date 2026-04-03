import { requireRRASession } from '@/lib/auth-guard';
import { AdminDashboardSearch } from '@/components/admin/admin-dashboard-search';
import { AdminRealtimeWrapper } from '@/components/admin/admin-realtime-wrapper';
import { TimeFilter } from '@/components/admin/time-filter';
import { AnalyticsInsightBar } from '@/components/admin/analytics-insight-bar';
import { VatPerformance } from '@/components/admin/analytics/vat-performance';
import { ComplianceOverview } from '@/components/admin/analytics/compliance-overview';
import { SectorAnalysis } from '@/components/admin/analytics/sector-analysis';
import { TransactionAnalytics } from '@/components/admin/analytics/transaction-analytics';
import { ProvinceTaxMap } from '@/components/admin/analytics/province-tax-map';
import { EconomicSummary } from '@/components/admin/analytics/economic-summary';
import { TaxGapDashboard } from '@/components/admin/tax-gap-dashboard';
import { Suspense } from 'react';

export default async function AdminDashboardAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { user, staff } = await requireRRASession();
  const params = await searchParams;
  const from = params.from;
  const to = params.to;

  return (
    <AdminRealtimeWrapper userId={user.id}>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {staff.department ?? 'General'} department · Data, trends & comparisons
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Suspense fallback={null}>
              <TimeFilter />
            </Suspense>
            <AdminDashboardSearch />
          </div>
        </div>

        {/* ── 0. Insight Summary Bar ──────────────────────────── */}
        <AnalyticsInsightBar />

        {/* ── 1. Revenue & Tax Performance (full width) ───────── */}
        <VatPerformance from={from} to={to} />

        {/* ── 2. Compliance Overview + Tax Gap ────────────────── */}
        <div className="grid gap-5 lg:grid-cols-2">
          <ComplianceOverview from={from} to={to} />
          <TaxGapDashboard />
        </div>

        {/* ── 3. Sector Analysis (full width) ─────────────────── */}
        <SectorAnalysis from={from} to={to} />

        {/* ── 4. Transaction Analytics ────────────────────────── */}
        <TransactionAnalytics from={from} to={to} />

        {/* ── 5. Province Tax Distribution (full width) ───────── */}
        <ProvinceTaxMap from={from} to={to} />

        {/* ── 6. Economic Intelligence ─────────────────────────── */}
        <EconomicSummary />
      </div>
    </AdminRealtimeWrapper>
  );
}
