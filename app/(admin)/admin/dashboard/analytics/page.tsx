import { requireRRASession } from '@/lib/auth-guard';
import { AdminDashboardSearch } from '@/components/admin/admin-dashboard-search';
import { AdminRealtimeWrapper } from '@/components/admin/admin-realtime-wrapper';
import { RevenueForecastChart } from '@/components/admin/revenue-forecast-chart';
import { AuditRecommendations } from '@/components/admin/audit-recommendations';
import { ComplianceRiskHeatmap } from '@/components/admin/compliance-risk-heatmap';
import { ComplianceTrendChart } from '@/components/admin/compliance-trend-chart';
import { TaxGapDashboard } from '@/components/admin/tax-gap-dashboard';
import { SuspiciousPricingCard } from '@/components/admin/suspicious-pricing-card';
import { SmartAlertsPanel } from '@/components/admin/smart-alerts-panel';
import { SupplyChainMonitor } from '@/components/admin/supply-chain-monitor';
import { AuditPriorityQueue } from '@/components/admin/audit-priority-queue';
import { TraderRiskPanel } from '@/components/admin/trader-risk-panel';
import { EconomicIntelligence } from '@/components/admin/economic-intelligence';
import { TimeFilter } from '@/components/admin/time-filter';
import { AnalyticsInsightBar } from '@/components/admin/analytics-insight-bar';
import { TransactionBehavior } from '@/components/admin/transaction-behavior';
import { Suspense } from 'react';

export default async function AdminDashboardAnalyticsPage() {
  const { user, staff } = await requireRRASession();

  return (
    <AdminRealtimeWrapper userId={user.id}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {staff.department ?? 'General'} department · Intelligence & forecasting
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Suspense fallback={null}>
              <TimeFilter />
            </Suspense>
            <AdminDashboardSearch />
          </div>
        </div>

        {/* ── INTELLIGENCE SUMMARY ─────────────────────── */}
        <AnalyticsInsightBar />

        {/* ── AI REVENUE FORECAST ───────────────────────── */}
        <RevenueForecastChart />

        {/* ── Risk Heatmap + Suspicious Pricing ── */}
        <div className="grid gap-4 lg:grid-cols-2">
          <ComplianceRiskHeatmap />
          <SuspiciousPricingCard />
        </div>

        {/* ── Tax Gap + Compliance Trend ──── */}
        <div className="grid gap-4 lg:grid-cols-2">
          <TaxGapDashboard />
          <ComplianceTrendChart />
        </div>

        {/* ── Supply Chain + Audit Queue ──── */}
        <div className="grid gap-4 lg:grid-cols-2">
          <SupplyChainMonitor />
          <AuditPriorityQueue />
        </div>

        {/* ── Trader Risk Panel + Economic Intel ─ */}
        <div className="grid gap-4 lg:grid-cols-2">
          <TraderRiskPanel />
          <EconomicIntelligence />
        </div>

        {/* ── Transaction Behavior ──────────────── */}
        <TransactionBehavior />

        {/* ── AI AUDIT RECOMMENDATIONS ────────────────────── */}
        <AuditRecommendations />

        {/* ── SMART ALERTS ───────────────────────────────── */}
        <SmartAlertsPanel />
      </div>
    </AdminRealtimeWrapper>
  );
}
