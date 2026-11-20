import { requireRRAPermission } from '@/lib/auth-guard';
import {
  getIndustrialMonitoringStats,
  listIndustrialAlerts,
  listAllGateways,
  getReconciliationDashboardSummary,
} from '@/lib/actions/industrial-factory.action';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Factory, Wifi, AlertTriangle, Activity, CheckCircle, XCircle, Clock, TrendingDown } from 'lucide-react';
import { IndustrialAlertActions } from './_components/alert-actions';

function severityVariant(s: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (s === 'critical' || s === 'high') return 'destructive';
  if (s === 'medium') return 'secondary';
  return 'outline';
}

function alertStatusVariant(s: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (s === 'resolved') return 'default';
  if (s === 'acknowledged') return 'secondary';
  if (s === 'open') return 'destructive';
  return 'outline';
}

function outcomeVariant(o: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (o === 'matched') return 'default';
  if (o === 'discrepant') return 'destructive';
  if (o === 'no_machine_evidence' || o === 'insufficient_data') return 'secondary';
  return 'outline';
}

function isOnline(lastSeenAt: Date | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < 15 * 60 * 1000; // 15 min
}

function fmtQty(v: string | null | undefined): string {
  if (v == null) return '—';
  const n = Number(v);
  return isNaN(n) ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default async function IndustrialMonitoringPage() {
  await requireRRAPermission('taxpayer.activity.read');

  const [statsRes, alertsRes, gatewaysRes, reconRes] = await Promise.all([
    getIndustrialMonitoringStats(),
    listIndustrialAlerts(),
    listAllGateways(),
    getReconciliationDashboardSummary(),
  ]);

  const stats = statsRes.success ? statsRes.data : null;
  const alerts = alertsRes.success ? alertsRes.data : [];
  const gateways = gatewaysRes.success ? gatewaysRes.data : [];
  const recon = reconRes.success ? reconRes.data : null;

  const openAlerts = alerts.filter(a => a.status === 'open');
  const onlineGateways = gateways.filter(g => isOnline(g.lastHeartbeatAt));

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Industrial Monitoring</h1>
        <p className="text-muted-foreground text-sm mt-1">Real-time factory floor, gateway activity, and production reconciliation</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Factory className="h-4 w-4" /> Factories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.factories.total ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.factories.approved ?? 0} approved · {stats?.factories.submitted ?? 0} pending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wifi className="h-4 w-4" /> Gateways
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.gateways.active ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {onlineGateways.length} online now · {stats?.gateways.pending ?? 0} pending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" /> Events Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.events.today ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Machine telemetry received</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Open Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.alerts.open ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.alerts.acknowledged ?? 0} acknowledged
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Reconciliation Summary Cards */}
      {recon && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-500" /> Awaiting Reconciliation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{recon.evidenceStats?.pending ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Batches pending verification</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" /> Reconciled
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{recon.evidenceStats?.supported ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Machine evidence matched</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" /> Discrepancies
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{recon.evidenceStats?.discrepant ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Machine vs declared variance</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-orange-500" /> No Machine Evidence
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{recon.evidenceStats?.insufficient ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Batches without telemetry</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Production Quantity Summary */}
      {recon?.batchQuantityTotals && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Production Quantity Overview</CardTitle>
            <CardDescription>Totals across all batches with machine evidence</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-5">
              <div>
                <p className="text-xs text-muted-foreground">Declared (total)</p>
                <p className="text-lg font-semibold">{fmtQty(recon.batchQuantityTotals.totalDeclared)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Machine Reported</p>
                <p className="text-lg font-semibold">{fmtQty(recon.evidenceStats?.totalMachineQty ?? null)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Machine Rejected</p>
                <p className="text-lg font-semibold">{fmtQty(recon.evidenceStats?.totalMachineRejected ?? null)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Manufacturer Reported Good</p>
                <p className="text-lg font-semibold">{fmtQty(recon.batchQuantityTotals.totalReportedGood)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Manufacturer Reported Rejected</p>
                <p className="text-lg font-semibold">{fmtQty(recon.batchQuantityTotals.totalReportedRejected)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Verification Results */}
      {recon && recon.recentVerifications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Reconciliation Results</CardTitle>
            <CardDescription>Latest three-axis batch verification outcomes</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch Reference</TableHead>
                  <TableHead>Declared Qty</TableHead>
                  <TableHead>Machine Qty</TableHead>
                  <TableHead>Variance</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Tolerance</TableHead>
                  <TableHead>Checked At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recon.recentVerifications.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono text-xs">{v.batchReference ?? v.batchId.slice(0, 8)}</TableCell>
                    <TableCell className="text-sm">{fmtQty(v.declaredQty)}</TableCell>
                    <TableCell className="text-sm">{fmtQty(v.machineQuantity)}</TableCell>
                    <TableCell className={`text-sm font-medium ${v.varianceQty && Number(v.varianceQty) !== 0 ? 'text-red-600' : ''}`}>
                      {v.varianceQty ? (Number(v.varianceQty) > 0 ? '+' : '') + fmtQty(v.varianceQty) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={outcomeVariant(v.outcome)} className="text-xs">
                        {v.outcome.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">±{v.tolerancePct}%</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(v.checkedAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Factories with connectivity problems */}
      {recon && recon.offlineFactories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-red-600">Factories with Connectivity Problems</CardTitle>
            <CardDescription>{recon.offlineFactories.length} factory(ies) marked offline</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {recon.offlineFactories.map((f) => (
                <Badge key={f.id} variant="destructive" className="text-xs">{f.name}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gateway Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gateway Status</CardTitle>
          <CardDescription>Active gateways and their last communication time</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {gateways.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">No gateways registered yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Manufacturer</TableHead>
                  <TableHead>Factory</TableHead>
                  <TableHead>Protocol</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gateways.map((gw) => (
                  <TableRow key={gw.id}>
                    <TableCell className="font-mono text-xs">{gw.name}</TableCell>
                    <TableCell className="text-sm">{gw.manufacturerName ?? '—'}</TableCell>
                    <TableCell className="text-sm">{gw.factoryName ?? '—'}</TableCell>
                    <TableCell className="text-xs uppercase">{gw.gatewayCode}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${isOnline(gw.lastHeartbeatAt) ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <span className="text-xs">{isOnline(gw.lastHeartbeatAt) ? 'Online' : 'Offline'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {gw.lastHeartbeatAt ? new Date(gw.lastHeartbeatAt).toLocaleString() : 'Never'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Industrial Alerts</CardTitle>
          <CardDescription>
            {openAlerts.length > 0
              ? `${openAlerts.length} open alert${openAlerts.length !== 1 ? 's' : ''} require attention`
              : 'No open alerts'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">No alerts found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Manufacturer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell>
                      <Badge variant={severityVariant(alert.severity)} className="text-xs">
                        {alert.severity.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{alert.alertType.replace(/_/g, ' ')}</TableCell>
                    <TableCell className="text-sm font-medium">{(alert as { title?: string }).title ?? alert.alertType.replace(/_/g, ' ')}</TableCell>
                    <TableCell className="text-sm">{(alert as { manufacturerName?: string }).manufacturerName ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={alertStatusVariant(alert.status)} className="text-xs">
                        {alert.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(alert.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {alert.status === 'open' && (
                        <IndustrialAlertActions alertId={alert.id} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
