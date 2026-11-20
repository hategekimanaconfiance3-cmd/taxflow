import { requireTraderSession } from '@/lib/auth-guard';
import { listMyFactories, listMyGateways } from '@/lib/actions/industrial-factory.action';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Factory, Wifi, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { RegisterFactoryDialog, RegisterGatewayDialog, RegisterProductionLineDialog } from './_components/factory-dialogs';

function statusBadge(status: string) {
  const variants: Record<string, { label: string; className: string }> = {
    approved:      { label: 'Approved',      className: 'bg-green-100 text-green-800 border-green-200' },
    pending:       { label: 'Pending Review', className: 'bg-amber-100 text-amber-800 border-amber-200' },
    suspended:     { label: 'Suspended',      className: 'bg-red-100 text-red-800 border-red-200' },
    decommissioned:{ label: 'Decommissioned', className: 'bg-gray-100 text-gray-600 border-gray-200' },
    active:        { label: 'Active',         className: 'bg-green-100 text-green-800 border-green-200' },
    revoked:       { label: 'Revoked',        className: 'bg-red-100 text-red-800 border-red-200' },
    offline:       { label: 'Offline',        className: 'bg-gray-100 text-gray-600 border-gray-200' },
  };
  const v = variants[status] ?? { label: status, className: 'bg-gray-100 text-gray-600 border-gray-200' };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${v.className}`}>{v.label}</span>;
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'approved' || status === 'active') return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status === 'pending') return <Clock className="h-4 w-4 text-amber-500" />;
  return <AlertCircle className="h-4 w-4 text-red-500" />;
}

export default async function FactoriesPage() {
  const session = await requireTraderSession(['manufacturer']);

  const [factoriesRes, gatewaysRes] = await Promise.all([
    listMyFactories(),
    listMyGateways(),
  ]);

  const factories = factoriesRes.success ? factoriesRes.data : [];
  const gateways = gatewaysRes.success ? gatewaysRes.data : [];

  const pendingFactories = factories.filter(f => f.onboardingStatus === 'pending').length;
  const approvedFactories = factories.filter(f => f.onboardingStatus === 'approved').length;
  const activeGateways = gateways.filter(g => g.status === 'active').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">My Factories</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Register and manage your factories, production lines, and industrial gateways
          </p>
        </div>
        <RegisterFactoryDialog />
      </div>

      {/* Summary */}
      {factories.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <Factory className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{factories.length}</p>
                  <p className="text-xs text-muted-foreground">{approvedFactories} approved · {pendingFactories} pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <Wifi className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{gateways.length}</p>
                  <p className="text-xs text-muted-foreground">{activeGateways} active gateways</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="space-y-2 w-full">
                <RegisterGatewayDialog factories={factories} />
                <RegisterProductionLineDialog factories={factories} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty state */}
      {factories.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Factory className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-1">No factories registered yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Register your factory to connect production lines and industrial gateways for real-time monitoring.
            </p>
            <RegisterFactoryDialog />
          </CardContent>
        </Card>
      )}

      {/* Factories Table */}
      {factories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registered Factories</CardTitle>
            <CardDescription>Factories pending approval will be reviewed by TaxFlow administration</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Factory</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Reg. Number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Registered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {factories.map(f => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <StatusIcon status={f.onboardingStatus} />
                        <span className="font-medium text-sm">{f.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {f.address}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{f.registrationReference ?? '—'}</TableCell>
                    <TableCell>{statusBadge(f.onboardingStatus)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(f.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Gateways Table */}
      {gateways.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Industrial Gateways</CardTitle>
            <CardDescription>Gateways connect your factory floor to TaxFlow for independent production verification</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gateway Name</TableHead>
                  <TableHead>Factory</TableHead>
                  <TableHead>Gateway Code</TableHead>
                  <TableHead>Gateway ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gateways.map(g => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium text-sm">{g.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{g.factoryName ?? '—'}</TableCell>
                    <TableCell className="text-xs uppercase font-mono">{g.gatewayCode}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{g.gatewayCode}</TableCell>
                    <TableCell>{statusBadge(g.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {g.lastHeartbeatAt ? new Date(g.lastHeartbeatAt).toLocaleString() : 'Never connected'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* How it works */}
      <Card className="bg-muted/40">
        <CardHeader>
          <CardTitle className="text-sm">How Industrial Integration Works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. <strong>Register a factory</strong> → TaxFlow admin approves it</p>
          <p>2. <strong>Add production lines</strong> → Describe your physical production infrastructure</p>
          <p>3. <strong>Register a gateway</strong> → Get a one-time API key for your hardware/software gateway</p>
          <p>4. <strong>Gateway sends events</strong> → Machine telemetry is received at <code className="text-xs">/api/industrial/events</code></p>
          <p>5. <strong>Automatic reconciliation</strong> → TaxFlow independently verifies your production quantities against machine evidence</p>
        </CardContent>
      </Card>
    </div>
  );
}
