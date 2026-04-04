"use client";

import { useEffect, useState } from "react";
import type { DecisionPanelData, DecisionAction } from "@/app/api/ai/decision-panel/route";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DecisionPanelSkeleton } from "@/components/admin/loading-skeletons";
import {
  BrainCircuit,
  AlertCircle,
  AlertTriangle,
  Info,
  ArrowRight,
  Lightbulb,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// AI Decision Panel — suggested actions with impact, reasoning, action button
// ---------------------------------------------------------------------------

const IMPACT_CONFIG = {
  critical: {
    icon: AlertCircle,
    bg: "bg-red-50/60 border-red-200",
    badge: "bg-red-100 text-red-700",
    text: "text-red-800",
    subtext: "text-red-600",
    btnClass: "bg-red-600 hover:bg-red-700 text-white",
    label: "Critical",
    dot: "bg-red-500 animate-pulse",
  },
  high: {
    icon: AlertTriangle,
    bg: "bg-orange-50/50 border-orange-200",
    badge: "bg-orange-100 text-orange-700",
    text: "text-orange-800",
    subtext: "text-orange-600",
    btnClass: "bg-orange-500 hover:bg-orange-600 text-white",
    label: "High Impact",
    dot: "bg-orange-500",
  },
  medium: {
    icon: Info,
    bg: "bg-amber-50/40 border-amber-200",
    badge: "bg-amber-100 text-amber-700",
    text: "text-amber-800",
    subtext: "text-amber-600",
    btnClass: "bg-amber-500 hover:bg-amber-600 text-white",
    label: "Medium Impact",
    dot: "bg-amber-400",
  },
  low: {
    icon: Info,
    bg: "border-muted/80",
    badge: "bg-muted/60 text-muted-foreground",
    text: "text-foreground",
    subtext: "text-muted-foreground",
    btnClass: "bg-muted/80 hover:bg-muted text-foreground",
    label: "Low Impact",
    dot: "bg-muted-foreground/40",
  },
} as const;

function ActionCard({ action, index }: { action: DecisionAction; index: number }) {
  const cfg = IMPACT_CONFIG[action.impact];
  const Icon = cfg.icon;

  return (
    <div className={`rounded-lg border ${cfg.bg} overflow-hidden`}>
      <div className="px-3.5 py-3 space-y-2.5">
        {/* Header */}
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 shrink-0 flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-muted-foreground/60 w-4">{index + 1}.</span>
            <span className={`inline-block h-2 w-2 rounded-full ${cfg.dot}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className={`text-xs font-bold leading-snug ${cfg.text}`}>{action.title}</p>
              <Badge variant="secondary" className={`text-[9px] shrink-0 ${cfg.badge}`}>{cfg.label}</Badge>
            </div>
          </div>
        </div>

        {/* AI Reasoning */}
        <div className="ml-7 space-y-2">
          <div className="flex items-start gap-1.5 rounded-md bg-background/70 px-2.5 py-2">
            <Lightbulb className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">{action.reason}</p>
          </div>

          {/* Impact label */}
          <p className={`text-[11px] font-semibold ${cfg.subtext}`}>{action.impactLabel}</p>

          {/* Action button */}
          {action.href ? (
            <Link href={action.href}>
              <Button size="sm" className={`h-7 text-[11px] px-3 gap-1.5 mt-0.5 ${cfg.btnClass}`}>
                Take Action
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          ) : (
            <Button size="sm" disabled className="h-7 text-[11px] px-3 gap-1.5 mt-0.5 opacity-50">
              No action available
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function AIDecisionPanel() {
  const [data, setData] = useState<DecisionPanelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ai/decision-panel")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <DecisionPanelSkeleton />;
  }

  if (!data || data.actions.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500 mb-2" />
          <p className="text-sm font-medium">No urgent actions required</p>
          <p className="text-xs text-muted-foreground mt-1">No critical signals detected — system operating normally.</p>
        </CardContent>
      </Card>
    );
  }

  const criticalCount = data.actions.filter(a => a.impact === "critical").length;
  const highCount = data.actions.filter(a => a.impact === "high").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-violet-500" />
            AI Decision Panel
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {criticalCount > 0 && (
              <Badge variant="secondary" className="bg-red-100 text-red-700 text-[10px]">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse mr-1" />
                {criticalCount} critical
              </Badge>
            )}
            {highCount > 0 && (
              <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-[10px]">
                {highCount} high
              </Badge>
            )}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">AI-generated action recommendations · each action has a reason and measurable impact</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.actions.map((action, i) => (
          <ActionCard key={action.id} action={action} index={i} />
        ))}
      </CardContent>
    </Card>
  );
}
