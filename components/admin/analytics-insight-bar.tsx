"use client";

import { useEffect, useState } from "react";
import type { AnalyticsSummary, AnalyticsInsight } from "@/app/api/admin/analytics-summary/route";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Analytics Insight Summary Bar
// Auto-generated intelligence panel at the top of the Analytics page.
// Surfaces the most critical system signals in one glance.
// ---------------------------------------------------------------------------

const LEVEL_CONFIG = {
  critical: {
    icon: AlertCircle,
    iconColor: "text-red-500",
    bg: "bg-red-50/80 border-red-200",
    text: "text-red-800",
    badge: "bg-red-100 text-red-700",
    label: "Critical",
  },
  warning: {
    icon: AlertTriangle,
    iconColor: "text-amber-500",
    bg: "bg-amber-50/80 border-amber-200",
    text: "text-amber-800",
    badge: "bg-amber-100 text-amber-700",
    label: "Warning",
  },
  ok: {
    icon: CheckCircle2,
    iconColor: "text-emerald-500",
    bg: "bg-emerald-50/50 border-emerald-100",
    text: "text-emerald-800",
    badge: "bg-emerald-100 text-emerald-700",
    label: "OK",
  },
  info: {
    icon: Info,
    iconColor: "text-blue-500",
    bg: "bg-blue-50/50 border-blue-200",
    text: "text-blue-800",
    badge: "bg-blue-100 text-blue-700",
    label: "Info",
  },
} as const;

function InsightPill({ insight }: { insight: AnalyticsInsight }) {
  const cfg = LEVEL_CONFIG[insight.severity];
  const Icon = cfg.icon;

  const inner = (
    <div className={cn("flex items-center gap-2 rounded-md border px-3 py-2 transition-colors", cfg.bg, insight.href && "hover:opacity-80 cursor-pointer")}>
      <Icon className={cn("h-3.5 w-3.5 shrink-0", cfg.iconColor)} />
      <div className="min-w-0">
        <p className={cn("text-xs font-medium leading-snug", cfg.text)}>{insight.title}</p>
        <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{insight.description}</p>
      </div>
    </div>
  );

  return insight.href ? <Link href={insight.href}>{inner}</Link> : <div>{inner}</div>;
}

export function AnalyticsInsightBar() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/analytics-summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border bg-muted/20 px-4 py-3 flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground">Generating intelligence summary…</span>
      </div>
    );
  }

  if (!data || data.insights.length === 0) return null;

  const hasCritical = data.insights.some((i) => i.severity === "critical");
  const hasWarning = data.insights.some((i) => i.severity === "warning");

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
            Intelligence Summary
          </span>
          {hasCritical && (
            <Badge variant="secondary" className="bg-red-100 text-red-700 text-[9px] h-4 px-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1 animate-pulse" />
              Action required
            </Badge>
          )}
          {!hasCritical && hasWarning && (
            <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-[9px] h-4 px-1.5">
              {data.warningCount} warnings
            </Badge>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground/50 font-mono">
          Recent signals
        </span>
      </div>

      {/* Insight pills */}
      <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {data.insights.map((insight) => (
          <InsightPill key={insight.id} insight={insight} />
        ))}
      </div>
    </div>
  );
}
