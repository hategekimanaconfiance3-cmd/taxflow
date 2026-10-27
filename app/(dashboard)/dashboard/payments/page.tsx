import { requireApprovedClearance } from '@/lib/auth-guard';
import { getTaxComplianceStatus } from '@/lib/actions/compliance.action';
import { TaxPaymentForm } from '@/components/dashboard/tax-payment-form/tax-payment-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';
import { CreditCard, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

export default async function PaymentsPage() {
  await requireApprovedClearance();

  const compliance = await getTaxComplianceStatus();

  const outstanding = Math.max(0, compliance.netOwed - compliance.totalPaid);
  const barColor =
    compliance.compliancePct >= 95
      ? 'bg-emerald-500'
      : compliance.compliancePct >= 70
      ? 'bg-amber-500'
      : 'bg-red-500';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tax Payments</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Submit your VAT payments to the Rwanda Revenue Authority.
        </p>
      </div>

      {/* Compliance summary */}
      <Card>
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-violet-500" />
            Your Tax Compliance Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pb-3">
          <div className="flex items-end gap-4">
            <div>
              <p className={cn('text-3xl font-bold', outstanding > 0 ? 'text-red-600' : 'text-emerald-600')}>
                {compliance.compliancePct.toFixed(0)}%
              </p>
              <p className="text-xs text-muted-foreground">compliance rate</p>
            </div>
            <div className="flex-1 pb-1.5">
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className={cn('h-full rounded-full', barColor)} style={{ width: `${compliance.compliancePct}%` }} />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground">VAT Owed</p>
              <p className="font-mono font-semibold">{formatRWF(compliance.netOwed)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Paid</p>
              <p className="font-mono font-semibold text-emerald-600">{formatRWF(compliance.totalPaid)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Outstanding</p>
              <p className={cn('font-mono font-semibold', outstanding > 0 ? 'text-red-600' : 'text-emerald-600')}>
                {formatRWF(outstanding)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment form */}
      <TaxPaymentForm outstanding={outstanding} />
    </div>
  );
}
