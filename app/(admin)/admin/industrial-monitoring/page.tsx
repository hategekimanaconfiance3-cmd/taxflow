import { requireRRAPermission } from '@/lib/auth-guard';
import { getIndustrialMonitoringStats, listIndustrialAlerts, listAllGateways } from '@/lib/actions/industrial-factory.action';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Factory, Wifi, AlertTriangle, Activity } from 'lucide-react';
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

function isOnline(lastSeenAt: Date | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < 15 * 60 * 1000; // 15 min
}

export default async function IndustrialMonitoringPage() {
  await requireRRAPermission('taxpayer.activity.read');

  const [statsRes, alertsRes, gatewaysRes] = await Promise.all([
    getIndustrialMonitoringStats(),
    listIndustrialAlerts(),
    listAllGateways(),
  ]);

  const stats = statsRes.success ? statsRes.data : null;
  const alerts = alertsRes.success ? alertsRes.data : [];
  const gateways = gatewaysRes.success ? gatewaysRes.data : [];

  const openAlerts = alerts.filter(a => a.status === 'open');
  const onlineGateways = gateways.filter(g => isOnline(g.lastSeenAt));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Industrial Monitoring</h1>
        <p className="text-muted-foreground text-sm mt-1">Real-time factory floor and gateway activity overview</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Factory className="h-4 w-4" /> Factories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.factories.total ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.factories.approved ?? 0} approved · {stats?.factories.pending ?? 0} pending
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
                    <TableCell className="text-xs uppercase">{gw.protocol}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${isOnline(gw.lastSeenAt) ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <span className="text-xs">{isOnline(gw.lastSeenAt) ? 'Online' : 'Offline'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {gw.lastSeenAt ? new Date(gw.lastSeenAt).toLocaleString() : 'Never'}
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
                  <TableHead>Title</TableHead>
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
                    <TableCell className="text-sm font-medium">{alert.title}</TableCell>
                    <TableCell className="text-sm">{alert.manufacturerName ?? '—'}</TableCell>
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
