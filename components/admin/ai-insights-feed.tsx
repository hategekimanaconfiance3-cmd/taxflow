"use client";

import { useEffect, useState } from "react";
import type { InsightsFeedData, InsightItem } from "@/app/api/ai/insights-feed/route";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FeedCardSkeleton } from "@/components/admin/loading-skeletons";
import {
  Rss,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// AI Insights Feed — real-time intelligence feed
// ---------------------------------------------------------------------------

const LEVEL_CONFIG = {
  critical: {
    icon: AlertCircle,
    dot: "bg-red-500 animate-pulse",
    border: "border-red-200 bg-red-50/50",
    text: "text-red-800",
    meta: "text-red-500",
    badge: "bg-red-100 text-red-700",
    label: "Critical",
  },
  warning: {
    icon: AlertTriangle,
    dot: "bg-amber-500",
    border: "border-amber-200 bg-amber-50/40",
    text: "text-amber-800",
    meta: "text-amber-500",
    badge: "bg-amber-100 text-amber-700",
    label: "Warning",
  },
  positive: {
    icon: CheckCircle2,
    dot: "bg-emerald-500",
    border: "border-emerald-100 bg-emerald-50/30",
    text: "text-emerald-800",
    meta: "text-emerald-500",
    badge: "bg-emerald-100 text-emerald-700",
    label: "OK",
  },
  info: {
    icon: Info,
    dot: "bg-blue-400",
    border: "border-blue-100 bg-blue-50/30",
    text: "text-blue-800",
    meta: "text-blue-400",
    badge: "bg-blue-100 text-blue-700",
    label: "Info",
  },
} as const;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function InsightCard({ item }: { item: InsightItem }) {
  const cfg = LEVEL_CONFIG[item.level];
  const Icon = cfg.icon;

  const inner = (
    <div className={cn("flex items-start gap-3 rounded-lg border px-3 py-3 transition-colors", cfg.border, item.href && "hover:opacity-90 cursor-pointer")}>
      <div className="mt-0.5 shrink-0">
        <span className={cn("inline-block h-2 w-2 rounded-full", cfg.dot)} />
      </div>
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className={cn("text-xs font-semibold leading-snug", cfg.text)}>{item.message}</p>
        {item.detail && (
          <p className="text-[10px] text-muted-foreground leading-snug">{item.detail}</p>
        )}
        <div className="flex items-center gap-2 pt-0.5">
          <span className={cn("text-[9px] font-mono", cfg.meta)}>{timeAgo(item.timestamp)}</span>
          <Badge variant="secondary" className={cn("text-[9px] px-1.5 h-4", cfg.badge)}>{cfg.label}</Badge>
          {item.metric && (
            <span className="text-[9px] font-mono text-muted-foreground">{item.metric}</span>
          )}
        </div>
      </div>
      {item.href && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 mt-0.5 shrink-0" />}
    </div>
  );

  return item.href ? <Link href={item.href}>{inner}</Link> : <div>{inner}</div>;
}

export function AIInsightsFeed() {
  const [data, setData] = useState<InsightsFeedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    fetch("/api/ai/insights-feed")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => { setLoading(false); setRefreshing(false); });
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) {
    return <FeedCardSkeleton items={5} />;
  }

  if (!data) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Rss className="h-4 w-4 text-violet-500" />
            AI Insights Feed
          </CardTitle>
          <div className="flex items-center gap-2">
            {data.criticalCount > 0 && (
              <Badge variant="secondary" className="bg-red-100 text-red-700 text-[10px]">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse mr-1" />
                {data.criticalCount} critical
              </Badge>
            )}
            {data.warningCount > 0 && (
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-[10px]">
                {data.warningCount} warnings
              </Badge>
            )}
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            </button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">Live system intelligence · click any item to investigate</p>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {data.items.map((item) => (
          <InsightCard key={item.id} item={item} />
        ))}
      </CardContent>
    </Card>
  );
}
