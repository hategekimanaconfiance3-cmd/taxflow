'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Banknote, Shield, Clock, Ship, Scale, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';
import { cn } from '@/lib/utils';

interface TaxCollectionProps {
  completionRate: number;
  collected: number;
  outstanding: number;
  paymentsCount: number;
}

interface OperationsProps {
  pendingTxns: number;
  importsToReview: number;
  disputesToReview: number;
  cleared: number;
  flagged: number;
  suspended: number;
}

interface TaxOpsCompactProps {
  tax: TaxCollectionProps;
  ops: OperationsProps;
  insight?: string;
}

export function TaxOpsCompact({ tax, ops, insight }: TaxOpsCompactProps) {
  const progressPct = Math.min(tax.completionRate, 100);
  const barColor =
    tax.completionRate >= 90 ? 'bg-emerald-500' : tax.completionRate >= 70 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Tax Collection */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Banknote className="h-4 w-4 text-emerald-500" />
            Tax Collection
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-3">
          <div className="flex items-end gap-3">
            <div>
              <p className="text-2xl font-bold tracking-tight">{tax.completionRate}%</p>
              <p className="text-[10px] text-muted-foreground">Payment Completion Rate</p>
            </div>
            <div className="flex-1 pb-1.5">
              <div className="w-full bg-muted rounded-full h-2">
                <div className={cn('h-2 rounded-full transition-all', barColor)} style={{ width: `${progressPct}%` }} />
              </div>
              <p className="text-[9px] text-muted-foreground/70 mt-1">Collected vs net VAT due</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-emerald-50/50 border border-emerald-100 px-2.5 py-1.5">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Collected</p>
              <p className="text-xs font-mono font-semibold text-emerald-700">{formatRWF(tax.collected)}</p>
            </div>
            <div className="rounded-md bg-red-50/50 border border-red-100 px-2.5 py-1.5">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Outstanding</p>
              <p className="text-xs font-mono font-semibold text-red-600">{formatRWF(Math.max(tax.outstanding, 0))}</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-muted-foreground shrink-0">
              {tax.paymentsCount} payment{tax.paymentsCount !== 1 ? 's' : ''} received
            </p>
            {insight && (
              <p className="text-[10px] text-muted-foreground italic truncate text-right">{insight}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Operations */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Shield className="h-4 w-4 text-violet-500" />
            Operations
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-2">
          <div className="space-y-1.5">
            {[
              { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10 text-amber-600', label: 'Pending Transactions', count: ops.pendingTxns },
              { icon: Ship, color: 'text-violet-500', bg: 'bg-violet-500/10 text-violet-600', label: 'Imports to Review', count: ops.importsToReview },
              { icon: Scale, color: 'text-blue-500', bg: 'bg-blue-500/10 text-blue-600', label: 'Disputes to Review', count: ops.disputesToReview },
            ].map(({ icon: Icon, color, bg, label, count }) => (
              <div key={label} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Icon className={cn('h-3.5 w-3.5', color)} />
                  {label}
                </span>
                {count === 0 ? (
                  <span className="text-[10px] text-muted-foreground/50">—</span>
                ) : (
                  <Badge variant="secondary" className={cn('text-[10px] h-4 px-1.5', bg)}>
                    {count}
                  </Badge>
                )}
              </div>
            ))}
          </div>
          <Separator className="opacity-50" />
          <div className="grid grid-cols-3 gap-1">
            {[
              { icon: CheckCircle, label: 'Cleared', count: ops.cleared, color: 'text-emerald-600' },
              { icon: AlertTriangle, label: 'Flagged', count: ops.flagged, color: 'text-amber-600' },
              { icon: XCircle, label: 'Suspended', count: ops.suspended, color: 'text-red-600' },
            ].map(({ icon: Icon, label, count, color }) => (
              <div key={label} className="text-center rounded-md bg-muted/30 py-1.5">
                <Icon className={cn('h-3.5 w-3.5 mx-auto mb-0.5', color)} />
                <p className={cn('text-sm font-bold', color)}>{count}</p>
                <p className="text-[9px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
