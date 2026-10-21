import { requireApprovedClearance } from '@/lib/auth-guard';
import { getTaxComplianceStatus } from '@/lib/actions/compliance.action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';
import { Badge } from '@/components/ui/badge';
import { Shield, TrendingUp, DollarSign, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { ExportPDFButton } from '@/components/dashboard/export-pdf-button/export-pdf-button';

export default async function TaxPage() {
  await requireApprovedClearance();

  const compliance = await getTaxComplianceStatus();
  const outstanding = Math.max(0, compliance.netOwed - compliance.totalPaid);
  const isCompliant = compliance.isCompliant;

  const barColor =
    compliance.compliancePct >= 95
      ? 'bg-emerald-500'
      : compliance.compliancePct >= 70
      ? 'bg-amber-500'
      : 'bg-red-500';

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tax & VAT Overview</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Your current VAT position, compliance status, and payment history.
            </p>
          </div>
          <ExportPDFButton />
        </div>
      </div>

      {/* Compliance status */}
      <Card className={cn('border-l-4', isCompliant ? 'border-l-emerald-500' : 'border-l-red-500')}>
        <CardHeader className="pb-2 pt-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4 text-violet-500" />
              Compliance Status
            </CardTitle>
            <Badge
              variant="secondary"
              className={isCompliant ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}
            >
              {isCompliant ? 'Compliant' : 'Non-Compliant'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pb-3 space-y-3">
          <div className="flex items-end gap-4">
            <p className={cn('text-4xl font-bold', isCompliant ? 'text-emerald-600' : 'text-red-600')}>
              {compliance.compliancePct.toFixed(0)}%
            </p>
            <div className="flex-1 pb-1.5">
              <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${compliance.compliancePct}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground/70 mt-1">Payments made vs net VAT due</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: TrendingUp, label: 'VAT Generated (Output)', value: formatRWF(compliance.vatOutput), cls: 'text-emerald-700' },
              { icon: DollarSign, label: 'VAT Deductible (Input)', value: formatRWF(compliance.vatInput), cls: 'text-blue-600' },
              { icon: Shield, label: 'Net VAT Due', value: formatRWF(compliance.netOwed), cls: '' },
              { icon: CheckCircle, label: 'Total Paid', value: formatRWF(compliance.totalPaid), cls: 'text-emerald-600' },
            ].map(({ icon: Icon, label, value, cls }) => (
              <div key={label} className="rounded-md bg-muted/30 px-3 py-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                <p className={cn('text-sm font-mono font-semibold mt-0.5', cls)}>{value}</p>
              </div>
            ))}
          </div>

          {outstanding > 0 && (
            <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50/60 px-3 py-2">
              <div>
                <p className="text-xs font-semibold text-red-700">Outstanding Balance</p>
                <p className="text-lg font-bold font-mono text-red-600">{formatRWF(outstanding)}</p>
              </div>
              <Link
                href="/dashboard/payments"
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
              >
                Pay Now →
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
