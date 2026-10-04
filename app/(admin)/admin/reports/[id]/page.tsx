import { requireRRASession } from '@/lib/auth-guard';
import { generateComplianceSummary } from '@/lib/actions/admin-scheduled-reports.action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Calendar } from 'lucide-react';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';
import { notFound } from 'next/navigation';

export default async function AdminScheduledReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRRASession();
  const { id } = await params;

  let report: Awaited<ReturnType<typeof generateComplianceSummary>> | null = null;
  try {
    report = await generateComplianceSummary();
  } catch {
    // Insufficient permissions
  }

  if (!report) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Scheduled Report</h1>
          <p className="text-muted-foreground text-sm mt-1">Report ID: {id}</p>
        </div>
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Report not available or insufficient permissions (requires compliance/reporting officer role).
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Compliance Summary Report</h1>
          <p className="text-muted-foreground text-sm mt-1 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {report.period} · Generated {new Date(report.generatedAt).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">Compliance Rate</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <p className="text-2xl font-bold text-emerald-600">
              {report.traders.complianceRate.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {report.traders.compliant} / {report.traders.total} traders
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">Revenue Collected</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <p className="text-2xl font-bold font-mono">
              {formatRWF(report.revenue.totalCollected)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {report.revenue.collectionRate.toFixed(1)}% collection rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">Transactions</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <p className="text-2xl font-bold">{report.transactions.totalCount.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatRWF(report.transactions.totalValue)} total value
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">Disputes</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <p className="text-2xl font-bold">{report.disputes.total}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {report.disputes.resolutionRate.toFixed(0)}% resolved
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Top arrears */}
      {report.topArrears.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Top Outstanding Traders
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.topArrears.map((trader, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{trader.traderName}</span>
                <span className="font-mono font-semibold text-red-600">
                  {formatRWF(trader.outstanding)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
