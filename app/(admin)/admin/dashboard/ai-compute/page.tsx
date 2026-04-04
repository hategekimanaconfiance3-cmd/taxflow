import { requireRRASession } from '@/lib/auth-guard';
import { AdminDashboardSearch } from '@/components/admin/admin-dashboard-search';
import { AdminRealtimeWrapper } from '@/components/admin/admin-realtime-wrapper';
import { RevenueForecastChart } from '@/components/admin/revenue-forecast-chart';
import { AuditRecommendations } from '@/components/admin/audit-recommendations';
import { SuspiciousPricingCard } from '@/components/admin/suspicious-pricing-card';
import { SmartAlertsPanel } from '@/components/admin/smart-alerts-panel';
import { AuditPriorityQueue } from '@/components/admin/audit-priority-queue';
import { TraderRiskPanel } from '@/components/admin/trader-risk-panel';
import { AIInsightsFeed } from '@/components/admin/ai-insights-feed';
import { AnomalyTimeline } from '@/components/admin/anomaly-timeline';
import { AIDecisionPanel } from '@/components/admin/ai-decision-panel';
import { BrainCircuit } from 'lucide-react';

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-1 shrink-0">
        {label}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export default async function TaxflowAIComputePage() {
  const { user, staff } = await requireRRASession();

  return (
    <AdminRealtimeWrapper userId={user.id}>
      <div className="space-y-8">

        {/* ── Header ───────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2.5">
              <BrainCircuit className="h-5 w-5 text-violet-500" />
              <h1 className="text-2xl font-bold tracking-tight">TaxFlow AI Compute</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {staff.department ?? 'General'} department · Active intelligence, decision engine & risk analysis
            </p>
          </div>
          <AdminDashboardSearch />
        </div>

        {/* ── 0. AI Decision Panel ─────────────────────────────── */}
        {/* Always first — this is where action happens */}
        <section className="space-y-3">
          <SectionDivider label="Suggested Actions" />
          <AIDecisionPanel />
        </section>

        {/* ── 1. AI Insights Feed ──────────────────────────────── */}
        <section className="space-y-3">
          <SectionDivider label="Live Intelligence Feed" />
          <AIInsightsFeed />
        </section>

        {/* ── 2. Revenue Forecast + Anomaly Timeline ───────────── */}
        <section className="space-y-3">
          <SectionDivider label="Revenue Forecast & Anomaly Detection" />
          <div className="grid gap-5 lg:grid-cols-2">
            <RevenueForecastChart />
            <AnomalyTimeline />
          </div>
        </section>

        {/* ── 3. Risk Intelligence ─────────────────────────────── */}
        <section className="space-y-3">
          <SectionDivider label="Risk Intelligence" />
          <div className="grid gap-5 lg:grid-cols-2">
            <TraderRiskPanel />
            <AuditPriorityQueue />
          </div>
        </section>

        {/* ── 4. Suspicious Pricing ────────────────────────────── */}
        <section className="space-y-3">
          <SectionDivider label="Suspicious Pricing Detection" />
          <SuspiciousPricingCard />
        </section>

        {/* ── 5. AI Audit Recommendations ──────────────────────── */}
        <section className="space-y-3">
          <SectionDivider label="AI Audit Recommendations" />
          <AuditRecommendations />
        </section>

        {/* ── 6. Smart Alerts ──────────────────────────────────── */}
        <section className="space-y-3">
          <SectionDivider label="Smart Alerts" />
          <SmartAlertsPanel />
        </section>

      </div>
    </AdminRealtimeWrapper>
  );
}
