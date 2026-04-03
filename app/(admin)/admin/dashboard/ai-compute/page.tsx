import { requireRRASession } from '@/lib/auth-guard';
import { AdminDashboardSearch } from '@/components/admin/admin-dashboard-search';
import { AdminRealtimeWrapper } from '@/components/admin/admin-realtime-wrapper';
import { RevenueForecastChart } from '@/components/admin/revenue-forecast-chart';
import { AuditRecommendations } from '@/components/admin/audit-recommendations';
import { SuspiciousPricingCard } from '@/components/admin/suspicious-pricing-card';
import { SmartAlertsPanel } from '@/components/admin/smart-alerts-panel';
import { AuditPriorityQueue } from '@/components/admin/audit-priority-queue';
import { TraderRiskPanel } from '@/components/admin/trader-risk-panel';
import { Cpu } from 'lucide-react';

export default async function TaxflowAIComputePage() {
  const { user, staff } = await requireRRASession();

  return (
    <AdminRealtimeWrapper userId={user.id}>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2.5">
              <Cpu className="h-5 w-5 text-violet-500" />
              <h1 className="text-2xl font-bold tracking-tight">TaxFlow AI Compute</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {staff.department ?? 'General'} department · AI-powered predictions, recommendations & risk intelligence
            </p>
          </div>
          <div className="flex items-center gap-2">
            <AdminDashboardSearch />
          </div>
        </div>

        {/* ── AI Revenue Forecast ────────────────────────── */}
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-2">
              Revenue Forecast
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <RevenueForecastChart />
        </section>

        {/* ── Risk Intelligence ──────────────────────────── */}
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-2">
              Risk Intelligence
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <TraderRiskPanel />
            <AuditPriorityQueue />
          </div>
        </section>

        {/* ── Anomaly Detection ─────────────────────────── */}
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-2">
              Anomaly Detection
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <SuspiciousPricingCard />
        </section>

        {/* ── AI Audit Recommendations ──────────────────── */}
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-2">
              Audit Recommendations
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <AuditRecommendations />
        </section>

        {/* ── Smart Alerts ──────────────────────────────── */}
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-2">
              Smart Alerts
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <SmartAlertsPanel />
        </section>
      </div>
    </AdminRealtimeWrapper>
  );
}
