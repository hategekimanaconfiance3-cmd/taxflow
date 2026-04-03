"use client";

import { useEffect, useState } from "react";
import type { SupplyChainData } from "@/lib/actions/supply-chain-stats.action";
import { formatCompact } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, GitBranch, AlertTriangle, Inbox } from "lucide-react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Section 5 — Supply Chain Analytics (simplified)
// Flow summary + stale pending count only
// ---------------------------------------------------------------------------

export function SupplyChainSummary() {
  const [data, setData] = useState<SupplyChainData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/supply-chain")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
          <span className="text-sm text-muted-foreground">Loading supply chain…</span>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const hasFlows = data.flowSummary.length > 0;
  const totalFlowValue = data.flowSummary.reduce((s, f) => s + f.value, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            Supply Chain
          </CardTitle>
          <div className="flex items-center gap-2">
            {data.stalePendingCount > 0 && (
              <Badge variant="secondary" className="bg-red-100 text-red-700 text-[10px]">
                <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                {data.stalePendingCount} delayed &gt;48h
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground border rounded px-2 py-0.5">
              Last 7 days
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border px-4 py-3 text-center">
            <p className="text-2xl font-bold">{data.pendingConfirmations}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">Pending Confirmations</p>
          </div>
          <div className="rounded-xl border px-4 py-3 text-center">
            <p className="text-2xl font-bold">{data.productsInCirculation}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">Products in Circulation</p>
          </div>
        </div>

        {/* Flow summary */}
        {hasFlows ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Product Flow</p>
            {data.flowSummary.map((flow) => {
              const widthPct = totalFlowValue > 0 ? (flow.value / totalFlowValue) * 100 : 0;
              return (
                <div key={flow.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{flow.label}</span>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>{flow.count} txns</span>
                      <span className="font-mono">{formatCompact(flow.value)}</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/60"
                      style={{ width: `${Math.max(widthPct, 4)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 gap-2 rounded-lg bg-muted/20 border">
            <Inbox className="h-6 w-6 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">No supply chain flows in the last 7 days</p>
          </div>
        )}

        {/* Broken chain alert */}
        {data.stalePendingCount > 0 && (
          <Link
            href="/admin/supply-chain"
            className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50/40 px-3 py-2 text-xs text-red-700 hover:bg-red-50 transition-colors"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>
              <strong>{data.stalePendingCount} transaction{data.stalePendingCount > 1 ? "s" : ""}</strong> pending over 48h —{" "}
              <span className="underline underline-offset-2">review broken chain</span>
            </span>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
