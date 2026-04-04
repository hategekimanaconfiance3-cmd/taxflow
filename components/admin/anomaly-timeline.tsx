"use client";

import { useEffect, useState } from "react";
import type { AnomalyTimelineData } from "@/app/api/ai/anomaly-timeline/route";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Activity, TrendingDown, TrendingUp, Minus } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";

// ---------------------------------------------------------------------------
// Anomaly Timeline — 30-day chart of anomaly events by type
// ---------------------------------------------------------------------------

interface TooltipArgs {
  active?: boolean;
  payload?: Array<{ value?: number; name?: string; color?: string }>;
  label?: string;
}

function AnomalyTooltip({ active, payload, label }: TooltipArgs) {
  if (!active || !payload?.length) return null;
  const pricing = payload.find(p => p.name === "pricingAnomalies")?.value ?? 0;
  const compliance = payload.find(p => p.name === "complianceFlags")?.value ?? 0;
  const gaps = payload.find(p => p.name === "transactionGaps")?.value ?? 0;
  const total = (pricing as number) + (compliance as number) + (gaps as number);
  return (
    <div className="rounded-lg border bg-background shadow-lg px-3 py-2.5 text-xs space-y-1 min-w-[160px]">
      <p className="font-semibold">{label}</p>
      <div className="space-y-0.5">
        {(pricing as number) > 0 && (
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />Pricing</span>
            <span className="font-mono font-semibold text-amber-600">{pricing}</span>
          </div>
        )}
        {(compliance as number) > 0 && (
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />Compliance</span>
            <span className="font-mono font-semibold text-red-600">{compliance}</span>
          </div>
        )}
        {(gaps as number) > 0 && (
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" />Txn gaps</span>
            <span className="font-mono font-semibold text-blue-500">{gaps}</span>
          </div>
        )}
        {total > 0 && (
          <div className="flex items-center justify-between gap-3 border-t pt-0.5 mt-0.5 font-semibold">
            <span>Total</span>
            <span className="font-mono">{total}</span>
          </div>
        )}
        {total === 0 && <p className="text-muted-foreground text-[10px]">No anomalies this day</p>}
      </div>
    </div>
  );
}

export function AnomalyTimeline() {
  const [data, setData] = useState<AnomalyTimelineData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ai/anomaly-timeline")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Building anomaly timeline…</span>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const TrendIcon = data.trend === "increasing" ? TrendingUp : data.trend === "decreasing" ? TrendingDown : Minus;
  const trendColor = data.trend === "increasing" ? "text-red-600" : data.trend === "decreasing" ? "text-emerald-600" : "text-muted-foreground";
  const trendLabel = data.trend === "increasing" ? "Anomalies increasing" : data.trend === "decreasing" ? "Anomalies decreasing" : "Stable";

  const chartData = data.timeline;

  const avg = data.totalAnomalies > 0 ? data.totalAnomalies / data.timeline.length : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-red-500" />
            Anomaly Timeline
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
              <TrendIcon className="h-3.5 w-3.5" />
              {trendLabel}
            </div>
            {data.peakDate && (
              <Badge variant="secondary" className="bg-red-100 text-red-700 text-[10px]">
                Peak: {data.peakDate} ({data.peakTotal})
              </Badge>
            )}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">Last 30 days · pricing anomalies, compliance flags, transaction gaps</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border px-3 py-2 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total anomalies</p>
            <p className={`text-xl font-bold font-mono mt-0.5 ${data.totalAnomalies > 0 ? "text-red-600" : "text-emerald-600"}`}>{data.totalAnomalies}</p>
          </div>
          <div className="rounded-lg border px-3 py-2 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Peak day</p>
            <p className="text-sm font-bold mt-0.5">{data.peakDate ?? "—"}</p>
            {data.peakTotal > 0 && <p className="text-[9px] text-red-600 font-mono">{data.peakTotal} events</p>}
          </div>
          <div className="rounded-lg border px-3 py-2 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Daily avg</p>
            <p className="text-sm font-bold mt-0.5 font-mono">{avg.toFixed(1)}</p>
          </div>
        </div>

        {/* Stacked area chart */}
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id="pricingGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="complianceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="gapsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                interval={4}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              {avg > 0 && (
                <ReferenceLine
                  y={avg}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 3"
                  strokeWidth={1}
                  label={{ value: "avg", position: "insideTopRight", fontSize: 8, fill: "hsl(var(--muted-foreground))" }}
                />
              )}
              <Tooltip content={<AnomalyTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
              <Area type="monotone" dataKey="complianceFlags" stackId="1" stroke="#ef4444" strokeWidth={1.5} fill="url(#complianceGrad)" name="complianceFlags" />
              <Area type="monotone" dataKey="pricingAnomalies" stackId="1" stroke="#f59e0b" strokeWidth={1.5} fill="url(#pricingGrad)" name="pricingAnomalies" />
              <Area type="monotone" dataKey="transactionGaps" stackId="1" stroke="#60a5fa" strokeWidth={1} fill="url(#gapsGrad)" name="transactionGaps" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 flex-wrap">
          {[
            { color: "bg-red-500", label: "Compliance flags" },
            { color: "bg-amber-500", label: "Pricing anomalies" },
            { color: "bg-blue-400", label: "Transaction gaps" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className={`h-2 w-2 rounded-full ${color}`} />
              {label}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
