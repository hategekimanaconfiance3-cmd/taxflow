import { requireRRASession } from '@/lib/auth-guard';
import db from '@/db/drizzle';
import { sql } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Database, Server, CheckCircle2, XCircle, AlertTriangle, Cpu } from 'lucide-react';

async function checkDatabaseHealth(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { healthy: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { healthy: false, latencyMs: Date.now() - start, error: String(e).slice(0, 200) };
  }
}

export default async function SystemHealthPage() {
  await requireRRASession('super_admin');

  const [dbHealth, dataCounts] = await Promise.all([
    checkDatabaseHealth(),
    db
      .select({
        traders: sql<number>`COUNT(*) FILTER (WHERE role IN ('manufacturer','wholesaler','retailer'))::int`.as('traders'),
        staff: sql<number>`COUNT(*) FILTER (WHERE role = 'rra_staff')::int`.as('staff'),
      })
      .from(sql`"user"`)
      .then(([r]) => r ?? { traders: 0, staff: 0 }),
  ]);

  function StatusBadge({ healthy, label }: { healthy: boolean; label?: string }) {
    return (
      <div className="flex items-center gap-1.5">
        {healthy ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500" />
        )}
        <Badge
          variant="outline"
          className={
            healthy
              ? 'border-emerald-200 text-emerald-700 bg-emerald-50/60 text-[11px]'
              : 'border-red-200 text-red-700 bg-red-50/60 text-[11px]'
          }
        >
          {label ?? (healthy ? 'Healthy' : 'Unhealthy')}
        </Badge>
      </div>
    );
  }

  const latencyStatus =
    dbHealth.latencyMs > 1000 ? 'critical' : dbHealth.latencyMs > 500 ? 'elevated' : 'normal';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Server className="h-6 w-6 text-blue-500" />
          System Health
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Real-time system status — only metrics with verified data sources are shown
        </p>
      </div>

      {/* Health Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Database */}
        <Card className={!dbHealth.healthy ? 'border-red-200' : ''}>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5" /> Database (PostgreSQL)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            <StatusBadge healthy={dbHealth.healthy} />
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>Latency</span>
                <span
                  className={`font-mono font-semibold ${
                    latencyStatus === 'critical'
                      ? 'text-red-600'
                      : latencyStatus === 'elevated'
                      ? 'text-amber-600'
                      : 'text-emerald-600'
                  }`}
                >
                  {dbHealth.latencyMs}ms
                  {latencyStatus !== 'normal' && ` (${latencyStatus})`}
                </span>
              </div>
            </div>
            {dbHealth.error && (
              <p className="text-[10px] text-red-600 font-mono bg-red-50 p-1.5 rounded border border-red-100">
                {dbHealth.error}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Application */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5" /> Application
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            <StatusBadge healthy={true} label="Running" />
            <p className="text-xs text-muted-foreground">Next.js 15 · Node.js</p>
          </CardContent>
        </Card>

        {/* Data Counts */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5" /> Live Data Counts
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Registered traders</span>
              <span className="font-semibold font-mono">{dataCounts.traders.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Staff accounts</span>
              <span className="font-semibold font-mono">{dataCounts.staff.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Telemetry Limitations Notice */}
      <Card className="border-amber-200 bg-amber-50/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-4 w-4" /> Telemetry Availability Notice
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-amber-800 space-y-2">
          <p>
            The following monitoring capabilities are <strong>not yet available</strong> and require
            additional infrastructure:
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-amber-700">
            <li>API request / response time monitoring (requires request logging middleware)</li>
            <li>Background job queue status (requires job queue telemetry)</li>
            <li>Real-time error rates (requires error tracking service integration)</li>
            <li>WebSocket connection count (requires server-side metrics collection)</li>
            <li>Uptime percentage (requires external health monitoring service)</li>
            <li>AI service availability (requires provider health probe)</li>
          </ul>
          <p className="text-xs mt-2 font-medium">
            Only verified, real data is displayed here. No synthetic uptime or availability metrics
            are shown.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
