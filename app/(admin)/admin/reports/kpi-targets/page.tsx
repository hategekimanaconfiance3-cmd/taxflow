import { requireRRASession } from '@/lib/auth-guard';
import { getKPIProgress } from '@/lib/actions/admin-kpi-targets.action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target } from 'lucide-react';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  on_track: { label: 'On Track', cls: 'bg-emerald-100 text-emerald-700' },
  at_risk: { label: 'At Risk', cls: 'bg-amber-100 text-amber-700' },
  behind: { label: 'Behind', cls: 'bg-red-100 text-red-700' },
  no_target: { label: 'No Target', cls: 'bg-zinc-100 text-zinc-600' },
};

export default async function AdminKpiTargetsPage() {
  await requireRRASession();

  let report: Awaited<ReturnType<typeof getKPIProgress>> | null = null;
  try {
    report = await getKPIProgress();
  } catch {
    // Insufficient permissions
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">KPI Targets</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Track progress against RRA performance targets for revenue collection, compliance, and operations.
        </p>
      </div>

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
