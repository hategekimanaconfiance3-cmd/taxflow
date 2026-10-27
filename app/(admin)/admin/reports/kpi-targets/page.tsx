import { requireRRASession } from '@/lib/auth-guard';
import { getKPIProgress } from '@/lib/actions/admin-kpi-targets.action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';
import { cn } from '@/lib/utils';
import { KpiTargetEditor } from '@/components/admin/kpi-target-editor';
import type { KPIPeriod } from '@/lib/actions/admin-kpi-targets.action';
import { hasRRARole } from '@/lib/auth-guard';

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  on_track: { label: 'On Track', cls: 'bg-emerald-100 text-emerald-700' },
  at_risk: { label: 'At Risk', cls: 'bg-amber-100 text-amber-700' },
  behind: { label: 'Behind', cls: 'bg-red-100 text-red-700' },
  no_target: { label: 'No Target', cls: 'bg-zinc-100 text-zinc-600' },
};

export default async function AdminKpiTargetsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { staff } = await requireRRASession("compliance_officer", "reporting_officer", "tax_compliance_officer", "director_executive");
  const params = await searchParams;
  const period: KPIPeriod = params.period === "quarterly" || params.period === "annual" ? params.period : "monthly";
  const canSetTargets = hasRRARole(staff, "super_admin");

  let report: Awaited<ReturnType<typeof getKPIProgress>> | null = null;
  try {
    report = await getKPIProgress(period);
  } catch {
    // Insufficient permissions
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">KPI Targets</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Track confirmed payment, registration, compliance, and operations metrics against RRA targets.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <label className="grid gap-1 text-xs text-muted-foreground">Reporting period<select name="period" defaultValue={period} className="h-9 rounded-md border bg-background px-3 text-sm text-foreground"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></label>
        <button type="submit" className="h-9 rounded-md border px-3 text-sm font-medium hover:bg-accent">Apply</button>
        <p className="text-xs text-muted-foreground">{report?.periodLabel ?? "Selected period"}. Confirmed payments, new registrations, and transaction value use this date range. Compliance and dispute resolution are current system-wide snapshots.</p>
      </form>

      {!report ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              KPI data unavailable. Requires compliance officer, reporting officer, or super admin role.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {report.metrics.map((metric) => {
            const statusCfg = STATUS_CONFIG[metric.status] ?? STATUS_CONFIG.no_target;
            const barColor =
              metric.status === 'on_track'
                ? 'bg-emerald-500'
                : metric.status === 'at_risk'
                ? 'bg-amber-500'
                : metric.status === 'behind'
                ? 'bg-red-500'
                : 'bg-zinc-300';

            const displayValue =
              metric.unit === 'RWF'
                ? formatRWF(metric.currentValue)
                : metric.unit === '%'
                ? `${metric.currentValue.toFixed(1)}%`
                : metric.currentValue.toLocaleString();

            const targetDisplay =
              metric.targetValue == null
                ? 'No target set'
                : metric.unit === 'RWF'
                ? formatRWF(metric.targetValue)
                : metric.unit === '%'
                ? `${metric.targetValue}%`
                : metric.targetValue.toLocaleString();

            return (
              <Card key={metric.key}>
                <CardHeader className="pb-2 pt-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">{metric.label}</CardTitle>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] ${statusCfg.cls}`}
                    >
                      {statusCfg.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pb-3 space-y-2">
                  <div className="flex items-end justify-between">
                    <p className="text-xl font-bold font-mono">{displayValue}</p>
                    <p className="text-xs text-muted-foreground">Target: {targetDisplay}</p>
                  </div>
                  {metric.targetValue != null && (
                    <div className="space-y-1">
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', barColor)}
                          style={{ width: `${Math.min(metric.progressPct, 100)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground text-right">
                        {metric.progressPct.toFixed(0)}% of target
                      </p>
                    </div>
                  )}
                  {canSetTargets && <KpiTargetEditor metricKey={metric.key} metricLabel={metric.label} unit={metric.unit} targetValue={metric.targetValue} period={period} />}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {report && (
        <p className="text-[10px] text-muted-foreground text-center">
          Computed at {new Date(report.computedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
