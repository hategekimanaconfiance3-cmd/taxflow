import { requireApprovedClearance } from '@/lib/auth-guard';
import { getTaxComplianceStatus } from '@/lib/actions/compliance.action';
import { getPaymentHistory } from '@/lib/actions/compliance-smart-payment.action';
import { getSavedPaymentMethods } from '@/lib/actions/payment-method.action';
import { SmartTaxPaymentForm } from '@/components/dashboard/tax-payment-form/smart-tax-payment-form';
import { PaymentHistory } from '@/components/dashboard/payment-history/payment-history';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';
import { Shield, Info, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default async function PaymentsPage() {
  const session = await requireApprovedClearance();

  const [compliance, savedMethods, history] = await Promise.all([
    getTaxComplianceStatus(),
    getSavedPaymentMethods(),
    getPaymentHistory(),
  ]);

  const outstanding = Math.max(0, compliance.netOwed - compliance.totalPaid);
  const businessName =
    session.user.businessName ?? session.user.name ?? 'Your Business';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tax Payments</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Pay your outstanding recorded VAT balance. Payments are verified by a TF officer.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/payment-methods">Manage Payment Methods</Link>
        </Button>
      </div>

      {/* VAT Balance Summary */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-violet-500" />
            Recorded VAT Balance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pb-4">
          <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              These are your recorded VAT totals in TaxFlow. They are
              informational and based on transactions recorded in this system,
              not an official TF tax assessment.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border px-3 py-2.5">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <TrendingUp className="h-3 w-3" />
                VAT Owed
              </div>
              <p className="font-mono font-semibold text-sm mt-1">
                {formatRWF(compliance.netOwed)}
              </p>
            </div>
            <div className="rounded-lg border px-3 py-2.5">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <TrendingDown className="h-3 w-3 text-emerald-600" />
                Paid
              </div>
              <p className="font-mono font-semibold text-sm mt-1 text-emerald-600">
                {formatRWF(compliance.totalPaid)}
              </p>
            </div>
            <div className="rounded-lg border px-3 py-2.5">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Minus className="h-3 w-3" />
                Outstanding
              </div>
              <p
                className={cn(
                  'font-mono font-semibold text-sm mt-1',
                  outstanding > 0 ? 'text-red-600' : 'text-emerald-600',
                )}
              >
                {formatRWF(outstanding)}
              </p>
            </div>
          </div>
          {outstanding > 0 && (
            <p className="text-xs text-muted-foreground">
              Compliance:{' '}
              <strong>{compliance.compliancePct.toFixed(1)}%</strong> paid
              (threshold: {compliance.threshold.toFixed(0)}%). Minimum to stay
              compliant:{' '}
              <strong>{formatRWF(Math.round(0.95 * outstanding))}</strong>.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Smart Payment Form */}
      <SmartTaxPaymentForm
        outstanding={outstanding}
        savedMethods={savedMethods}
        businessName={businessName}
      />

      {/* Payment History */}
      <PaymentHistory history={history} />
    </div>
  );
}
