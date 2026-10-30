import { requireApprovedClearance } from '@/lib/auth-guard';
import { getTaxComplianceStatus } from '@/lib/actions/compliance.action';
import { TaxPaymentForm } from '@/components/dashboard/tax-payment-form/tax-payment-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';
import { Shield, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export default async function PaymentsPage() {
  await requireApprovedClearance();

  const compliance = await getTaxComplianceStatus();

  const outstanding = Math.max(0, compliance.netOwed - compliance.totalPaid);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tax Payments</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Request settlement review for the full recorded outstanding VAT balance.
        </p>
      </div>

      {/* Informational recorded balance, not an official assessment */}
      <Card>
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-violet-500" />
            Recorded VAT balance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pb-3">
          <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>TaxFlow has no period-specific RRA assessment data here, so it cannot calculate a separate compliance score or period payment score. These recorded VAT totals are informational and do not block payment.</p>
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
