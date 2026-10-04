import { requireRRASession } from '@/lib/auth-guard';
import { getDataQualityMetrics } from '@/lib/actions/admin-data-quality.action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DatabaseZap } from 'lucide-react';
import { cn } from '@/lib/utils';

export default async function AdminDataQualityPage() {
  await requireRRASession();

  let metrics: Awaited<ReturnType<typeof getDataQualityMetrics>> | null = null;
  try {
    metrics = await getDataQualityMetrics();
  } catch {
    // Insufficient permissions
  }

  const scoreColor = (score: number) =>
    score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-red-600';

  const barColor = (score: number) =>
    score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Data Quality</h1>
        <p className="text-muted-foreground text-sm mt-1">
          System-wide data completeness, integrity, and audit activity metrics.
        </p>
      </div>

      {!metrics ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Data quality metrics unavailable. Requires compliance officer, audit officer, or super admin role.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Overall score */}
          <Card>
            <CardHeader className="pb-2 pt-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DatabaseZap className="h-4 w-4 text-violet-500" />
                  Overall Data Quality Score
                </CardTitle>
                <Badge
                  variant="secondary"
                  className={cn(
                    'text-sm font-bold',
                    metrics.overallScore >= 80
                      ? 'bg-emerald-100 text-emerald-700'
                      : metrics.overallScore >= 60
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-red-100 text-red-700'
                  )}
                >
                  {metrics.overallScore}/100
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pb-3">
              <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', barColor(metrics.overallScore))}
                  style={{ width: `${metrics.overallScore}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Trader completeness */}
            <Card>
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm font-medium">Trader Completeness</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pb-3">
                <div className="flex items-end justify-between">
                  <span className={cn('text-2xl font-bold', scoreColor(metrics.traderCompleteness.completenessRate))}>
                    {metrics.traderCompleteness.completenessRate.toFixed(0)}%
                  </span>
                  <span className="text-xs text-muted-foreground">{metrics.traderCompleteness.total} total traders</span>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>Missing Phone</span><span className="font-medium text-foreground">{metrics.traderCompleteness.missingPhone}</span></div>
                  <div className="flex justify-between"><span>Missing TIN</span><span className="font-medium text-foreground">{metrics.traderCompleteness.missingTin}</span></div>
                  <div className="flex justify-between"><span>Missing Business Name</span><span className="font-medium text-foreground">{metrics.traderCompleteness.missingBusinessName}</span></div>
                </div>
              </CardContent>
            </Card>

            {/* Transaction health */}
            <Card>
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm font-medium">Transaction Health</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pb-3">
                <div className="flex items-end justify-between">
                  <span className="text-2xl font-bold">{metrics.transactionHealth.total.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground">total transactions</span>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>Rejected</span><span className="font-medium text-red-600">{metrics.transactionHealth.rejected} ({metrics.transactionHealth.rejectionRate.toFixed(1)}%)</span></div>
                  <div className="flex justify-between"><span>Expired</span><span className="font-medium text-amber-600">{metrics.transactionHealth.expired} ({metrics.transactionHealth.expirationRate.toFixed(1)}%)</span></div>
                </div>
              </CardContent>
            </Card>

            {/* Stock integrity */}
            <Card>
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm font-medium">Stock Integrity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pb-3">
                <div className="flex items-end justify-between">
                  <span className="text-2xl font-bold">{metrics.stockIntegrity.totalRecords}</span>
                  <span className="text-xs text-muted-foreground">stock records</span>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>Negative Stock</span><span className="font-medium text-red-600">{metrics.stockIntegrity.negativeStock}</span></div>
                  <div className="flex justify-between"><span>Zero Stock</span><span className="font-medium text-amber-600">{metrics.stockIntegrity.zeroStock}</span></div>
                  <div className="flex justify-between"><span>Corrections Made</span><span className="font-medium text-foreground">{metrics.stockIntegrity.corrections}</span></div>
                </div>
              </CardContent>
            </Card>

            {/* Audit activity */}
            <Card>
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm font-medium">Audit Activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pb-3">
                <div className="flex items-end justify-between">
                  <span className="text-2xl font-bold">{metrics.auditActivity.totalEntries.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground">total entries</span>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>Last 7 days</span><span className="font-medium text-foreground">{metrics.auditActivity.last7Days}</span></div>
                  <div className="flex justify-between"><span>Last 30 days</span><span className="font-medium text-foreground">{metrics.auditActivity.last30Days}</span></div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
