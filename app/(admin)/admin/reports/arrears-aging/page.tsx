import { requireRRASession } from '@/lib/auth-guard';
import { getArrearsAging } from '@/lib/actions/admin-arrears-aging.action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Clock } from 'lucide-react';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';

const BUCKET_COLORS: Record<string, string> = {
  current: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-amber-100 text-amber-700',
  delinquent: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

export default async function AdminArrearsAgingPage() {
  await requireRRASession("compliance_officer", "reporting_officer", "tax_compliance_officer", "payments_reconciliation_officer", "data_ai_analyst");

  let data: Awaited<ReturnType<typeof getArrearsAging>> | null = null;
  try {
    data = await getArrearsAging();
  } catch {
    // Insufficient permissions
  }

  const buckets = [
    { label: 'Current (0–30d)', key: 'current', data: data?.current },
    { label: 'Overdue (31–60d)', key: 'overdue', data: data?.overdue },
    { label: 'Delinquent (61–90d)', key: 'delinquent', data: data?.delinquent },
    { label: 'Critical (90d+)', key: 'critical', data: data?.critical },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tax Arrears Aging</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Outstanding VAT debts grouped by aging buckets: current, overdue, delinquent, and critical.
        </p>
      </div>

      {/* Bucket summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {buckets.map((bucket) => (
          <Card key={bucket.key}>
            <CardHeader className="pb-1 pt-3">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {bucket.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3 space-y-1">
              <p className="text-xl font-bold font-mono">
                {formatRWF(bucket.data?.total ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground">
                {bucket.data?.count ?? 0} trader{(bucket.data?.count ?? 0) !== 1 ? 's' : ''}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detailed table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            Arrears Detail ({data?.traders.length ?? 0} traders)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trader</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Total Owed</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!data || data.traders.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                    No arrears data or insufficient permissions.
                  </TableCell>
                </TableRow>
              )}
              {data?.traders.map((trader) => (
                <TableRow key={trader.traderId}>
                  <TableCell className="font-medium text-xs">{trader.traderName}</TableCell>
                  <TableCell className="capitalize text-xs text-muted-foreground">{trader.role}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatRWF(trader.totalOwed)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-red-600 font-semibold">
                    {formatRWF(trader.outstanding)}
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    {trader.daysSinceOldest ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] capitalize ${BUCKET_COLORS[trader.agingBucket] ?? ''}`}
                    >
                      {trader.agingBucket}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
