import { requireRRASession } from '@/lib/auth-guard';
import { detectAnomalies } from '@/lib/actions/admin-anomaly.action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, AlertCircle, ShieldAlert } from 'lucide-react';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';

export default async function AdminAnomaliesPage() {
  await requireRRASession();

  let anomalies: Awaited<ReturnType<typeof detectAnomalies>> = [];
  try {
    anomalies = await detectAnomalies();
  } catch {
    // Insufficient permissions — show empty state
  }

  const critical = anomalies.filter((a) => a.severity === 'critical');
  const warnings = anomalies.filter((a) => a.severity === 'warning');

  const TYPE_LABELS: Record<string, string> = {
    high_quantity: 'High Quantity',
    duplicate_sale: 'Duplicate Sale',
    exceeds_stock: 'Exceeds Stock',
    high_value: 'High Value',
    high_risk_score: 'AI Risk Score',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Anomaly Detection</h1>
        <p className="text-muted-foreground text-sm mt-1">
          AI-powered detection of unusual transactions, stock issues, and high-risk merchants.
        </p>
      </div>

      {/* Summary badges */}
      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="bg-red-100 text-red-700 gap-1.5">
          <AlertCircle className="h-3.5 w-3.5" />
          {critical.length} critical
        </Badge>
        <Badge variant="secondary" className="bg-amber-100 text-amber-700 gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          {warnings.length} warning
        </Badge>
      </div>

      {anomalies.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
            <ShieldAlert className="h-10 w-10 text-emerald-400" />
            <p className="font-semibold">No anomalies detected</p>
            <p className="text-sm text-muted-foreground">
              The system scans the last 30 days of transactions. All patterns are within normal bounds.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {anomalies.map((anomaly, i) => (
            <Card
              key={`${anomaly.transactionId}-${i}`}
              className={`border-l-4 ${
                anomaly.severity === 'critical' ? 'border-l-red-500' : 'border-l-amber-500'
              }`}
            >
              <CardHeader className="pb-1 pt-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">
                    {TYPE_LABELS[anomaly.type] ?? anomaly.type}
                  </CardTitle>
                  <Badge
                    variant="secondary"
                    className={
                      anomaly.severity === 'critical'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                    }
                  >
                    {anomaly.severity}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pb-3 space-y-1.5">
                <p className="text-xs text-muted-foreground">{anomaly.description}</p>
                <div className="flex flex-wrap gap-3 text-xs">
                  <span>
                    <span className="text-muted-foreground">Seller: </span>
                    <span className="font-medium">{anomaly.sellerName}</span>
                  </span>
                  {anomaly.productName && (
                    <span>
                      <span className="text-muted-foreground">Product: </span>
                      <span className="font-medium">{anomaly.productName}</span>
                    </span>
                  )}
                  {anomaly.totalAmount > 0 && (
                    <span>
                      <span className="text-muted-foreground">Amount: </span>
                      <span className="font-mono font-medium">
                        {formatRWF(anomaly.totalAmount)}
                      </span>
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    {new Date(anomaly.date).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
