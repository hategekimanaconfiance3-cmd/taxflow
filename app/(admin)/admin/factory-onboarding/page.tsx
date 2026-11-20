import { requireRRAPermission } from '@/lib/auth-guard';
import { listAllFactories, listAllGateways } from '@/lib/actions/industrial-factory.action';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Factory, Wifi } from 'lucide-react';
import { FactoryActions, GatewayActions } from './_components/factory-actions';

// ---------------------------------------------------------------------------
// Status Badge helpers
// ---------------------------------------------------------------------------

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'approved': return 'default';
    case 'pending': return 'secondary';
    case 'suspended': return 'destructive';
    default: return 'outline';
  }
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function FactoryOnboardingPage() {
  await requireRRAPermission('taxpayer.activity.read');

  const [factoriesResult, gatewaysResult] = await Promise.all([
    listAllFactories(),
    listAllGateways(),
  ]);

  const factories = factoriesResult.success ? factoriesResult.data : [];
  const gateways = gatewaysResult.success ? gatewaysResult.data : [];

  return (
    <main className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Factory Onboarding</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review and manage registered factories and their industrial gateways.
        </p>
      </header>

      {/* Factories table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Factory className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Registered Factories</CardTitle>
          </div>
          <CardDescription className="text-xs">
            {factories.length} factor{factories.length !== 1 ? 'ies' : 'y'} registered
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {factories.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              No factories registered yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Manufacturer</TableHead>
                  <TableHead>Factory Name</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Reg. Number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {factories.map((factory: {
                  id: string;
                  manufacturerName: string;
                  factoryName: string;
                  location: string;
                  registrationNumber: string;
                  status: string;
                }) => (
                  <TableRow key={factory.id}>
                    <TableCell className="font-medium text-sm">
                      {factory.manufacturerName}
                    </TableCell>
                    <TableCell className="text-sm">{factory.factoryName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {factory.location}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {factory.registrationNumber}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(factory.status)} className="text-xs capitalize">
                        {statusLabel(factory.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <FactoryActions
                        factoryId={factory.id}
                        currentStatus={factory.status}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Gateways table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Wifi className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Industrial Gateways</CardTitle>
          </div>
          <CardDescription className="text-xs">
            {gateways.length} gateway{gateways.length !== 1 ? 's' : ''} registered
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {gateways.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              No gateways registered yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gateway ID</TableHead>
                  <TableHead>Factory</TableHead>
                  <TableHead>Device Type</TableHead>
                  <TableHead>Registered At</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gateways.map((gateway: {
                  id: string;
                  gatewayId: string;
                  factoryName: string;
                  deviceType: string;
                  registeredAt: string;
                  status: string;
                }) => (
                  <TableRow key={gateway.id}>
                    <TableCell className="font-mono text-xs">{gateway.gatewayId}</TableCell>
                    <TableCell className="text-sm">{gateway.factoryName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {gateway.deviceType}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(gateway.registeredAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(gateway.status)} className="text-xs capitalize">
                        {statusLabel(gateway.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <GatewayActions
                        gatewayId={gateway.id}
                        currentStatus={gateway.status}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
