import { requireRRASession } from "@/lib/auth-guard";
import {
  detectAnomaliesForRole,
  type AnomalyPermissions,
  type Anomaly,
} from "@/lib/actions/admin-anomaly.action";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, AlertCircle, ShieldAlert, Info } from "lucide-react";
import AnomalyCard from "./_components/anomaly-card";
import AnomalyFilters from "./_components/anomaly-filters";

// Cache for 5 minutes — anomaly detection is expensive; avoid per-request recomputation.
export const revalidate = 300;
// Give the function up to 60 s on Vercel (Pro) or 10 s on Hobby.
export const maxDuration = 60;

const TYPE_LABELS: Record<string, string> = {
  high_quantity: "High Quantity",
  duplicate_sale: "Duplicate Sale",
  exceeds_stock: "Exceeds Stock",
  high_value: "High Value",
  high_risk_score: "AI Risk Score",
};

const TYPE_CATEGORY: Record<string, string> = {
  high_quantity: "Transaction",
  duplicate_sale: "Transaction",
  high_value: "Transaction",
  exceeds_stock: "Stock",
  high_risk_score: "AI Risk",
};

export default async function AdminAnomaliesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  await requireRRASession();
  const params = await searchParams;

  let result: { anomalies: Anomaly[]; permissions: AnomalyPermissions } = {
    anomalies: [],
    permissions: {
      canInvestigate: false,
      canAssign: false,
      canResolve: false,
      canEscalate: false,
      canReopen: false,
      visibleTypes: [],
    },
  };
  let loadFailed = false;

  try {
    result = await detectAnomaliesForRole();
  } catch (error) {
    loadFailed = true;
    console.error(
      "Anomaly detection failed",
      error instanceof Error ? error.message : typeof error,
    );
  }

  const { anomalies, permissions } = result;
  const severityFilter = params.severity;
  const categoryFilter = params.category;

  const filtered = anomalies.filter((a) => {
    if (severityFilter && a.severity !== severityFilter) return false;
    if (
      categoryFilter &&
      (TYPE_CATEGORY[a.type] ?? "other").toLowerCase().replace(" ", "_") !==
        categoryFilter
    )
      return false;
    return true;
  });

  const critical = anomalies.filter((a) => a.severity === "critical").length;
  const warnings = anomalies.filter((a) => a.severity === "warning").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Anomaly Detection</h1>
        <p className="text-muted-foreground text-sm mt-1">
          AI-powered detection of unusual transactions, stock issues, and
          high-risk merchants.
        </p>
      </div>

      {/* Role context banner */}
      {permissions.visibleTypes.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Showing anomalies relevant to your role:{" "}
            {permissions.visibleTypes
              .map((t) => TYPE_LABELS[t] ?? t)
              .join(", ")}
            .
          </span>
        </div>
      )}

      {/* Summary badges */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge
          variant="secondary"
          className="bg-red-100 text-red-700 gap-1.5"
        >
          <AlertCircle className="h-3.5 w-3.5" />
          {critical} critical
        </Badge>
        <Badge
          variant="secondary"
          className="bg-amber-100 text-amber-700 gap-1.5"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {warnings} warning
        </Badge>
      </div>

      {/* Filters */}
      <AnomalyFilters
        currentSeverity={severityFilter}
        currentCategory={categoryFilter}
      />

      {/* Content */}
      {loadFailed ? (
        <Card role="alert" className="border-destructive/40">
          <CardContent className="py-8 flex flex-col items-center gap-2 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="font-semibold">Anomaly results could not be loaded</p>
            <p className="text-sm text-muted-foreground">
              Please try again. If this continues, contact your system
              administrator.
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
            <ShieldAlert className="h-10 w-10 text-emerald-400" />
            <p className="font-semibold">
              {anomalies.length === 0
                ? "No anomalies detected"
                : "No anomalies match your filters"}
            </p>
            <p className="text-sm text-muted-foreground">
              {anomalies.length === 0
                ? "The system scans the last 30 days. All patterns are within normal bounds for your role."
                : "Try adjusting the severity or category filter."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((anomaly, i) => (
            <AnomalyCard
              key={`${anomaly.type}:${anomaly.transactionId}:${i}`}
              anomaly={anomaly}
              permissions={permissions}
              typeLabel={TYPE_LABELS[anomaly.type] ?? anomaly.type}
              category={TYPE_CATEGORY[anomaly.type] ?? "Other"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
