"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, AlertCircle, Loader2, CheckCircle2, TrendingUp, Package, Cpu } from "lucide-react";
import type { Anomaly, AnomalyPermissions } from "@/lib/actions/admin-anomaly.action";
import {
  claimAnomaly,
  resolveAnomaly,
  escalateAnomaly,
} from "@/lib/actions/anomaly-investigation.action";

interface AnomalyCardProps {
  anomaly: Anomaly;
  permissions: AnomalyPermissions;
  typeLabel: string;
  category: string;
}

function getAnomalyKey(anomaly: Anomaly): string {
  if (anomaly.type === "exceeds_stock") return `stock:${anomaly.sellerName}:${anomaly.productName}`;
  if (anomaly.type === "high_risk_score") return `ai_risk:${anomaly.sellerName}`;
  return `${anomaly.type}:${anomaly.transactionId}`;
}

const CATEGORY_ICON: Record<string, React.ReactNode> = {
  Transaction: <TrendingUp className="h-3.5 w-3.5" />,
  Stock: <Package className="h-3.5 w-3.5" />,
  "AI Risk": <Cpu className="h-3.5 w-3.5" />,
};

export default function AnomalyCard({ anomaly, permissions, typeLabel, category }: AnomalyCardProps) {
  const [status, setStatus] = useState<"idle" | "claimed" | "resolved" | "escalated">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const anomalyKey = getAnomalyKey(anomaly);
  const isCritical = anomaly.severity === "critical";

  function handleClaim() {
    setErrorMsg(null);
    startTransition(async () => {
      const result = await claimAnomaly(anomalyKey, {
        type: anomaly.type,
        severity: anomaly.severity,
        sellerName: anomaly.sellerName,
        productName: anomaly.productName,
        description: anomaly.description,
      });
      if ("error" in result) {
        setErrorMsg(result.error ?? "Failed to claim");
      } else {
        setStatus("claimed");
      }
    });
  }

  function handleResolve() {
    setErrorMsg(null);
    startTransition(async () => {
      const result = await resolveAnomaly(anomalyKey, "Resolved by investigating officer", false);
      if ("error" in result) {
        setErrorMsg(result.error ?? "Failed to resolve");
      } else {
        setStatus("resolved");
      }
    });
  }

  function handleEscalate() {
    setErrorMsg(null);
    startTransition(async () => {
      const result = await escalateAnomaly(anomalyKey, "Escalated for senior review");
      if ("error" in result) {
        setErrorMsg(result.error ?? "Failed to escalate");
      } else {
        setStatus("escalated");
      }
    });
  }

  return (
    <Card
      className={`border-l-4 transition-opacity ${
        isCritical ? "border-l-red-500" : "border-l-amber-500"
      } ${status !== "idle" ? "opacity-70" : ""}`}
    >
      <CardHeader className="pb-1 pt-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-sm font-semibold">{typeLabel}</CardTitle>
            <Badge
              variant="secondary"
              className="gap-1 text-xs"
            >
              {CATEGORY_ICON[category]}
              {category}
            </Badge>
            <Badge
              variant="secondary"
              className={
                isCritical
                  ? "bg-red-100 text-red-700 text-xs"
                  : "bg-amber-100 text-amber-700 text-xs"
              }
            >
              {isCritical ? (
                <AlertCircle className="h-3 w-3 mr-1" />
              ) : (
                <AlertTriangle className="h-3 w-3 mr-1" />
              )}
              {anomaly.severity}
            </Badge>
            {status !== "idle" && (
              <Badge
                variant="secondary"
                className={
                  status === "resolved"
                    ? "bg-green-100 text-green-700 text-xs"
                    : status === "escalated"
                    ? "bg-purple-100 text-purple-700 text-xs"
                    : "bg-blue-100 text-blue-700 text-xs"
                }
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {status === "claimed"
                  ? "Under Investigation"
                  : status === "resolved"
                  ? "Resolved"
                  : "Escalated"}
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {new Date(anomaly.date).toLocaleDateString()}
          </span>
        </div>
      </CardHeader>

      <CardContent className="pb-3 space-y-2">
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
                {anomaly.totalAmount.toLocaleString()} RWF
              </span>
            </span>
          )}
        </div>

        {errorMsg && (
          <p className="text-xs text-destructive">{errorMsg}</p>
        )}

        {/* Action buttons — only shown when user has the permission and status allows */}
        {status === "idle" && (
          <div className="flex flex-wrap gap-2 pt-1">
            {permissions.canInvestigate && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={handleClaim}
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : null}
                Investigate
              </Button>
            )}
            {permissions.canResolve && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs text-green-700 border-green-200 hover:bg-green-50"
                onClick={handleResolve}
                disabled={isPending}
              >
                Mark Resolved
              </Button>
            )}
            {permissions.canEscalate && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs text-purple-700 border-purple-200 hover:bg-purple-50"
                onClick={handleEscalate}
                disabled={isPending}
              >
                Escalate
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
