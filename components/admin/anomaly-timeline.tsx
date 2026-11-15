"use client";

import { useEffect, useState } from "react";
import type { AnomalyTimelineData } from "@/app/api/ai/anomaly-timeline/route";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, TrendingDown, TrendingUp, Minus, ShieldCheck } from "lucide-react";
import { ChartCardSkeleton } from "@/components/admin/loading-skeletons";
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
  const suspicious = payload.find(p => p.name === "suspiciousCount")?.value ?? 0;
  const audits = payload.find(p => p.name === "auditCount")?.value ?? 0;
  const total = payload.find(p => p.name === "anomalyCount")?.value ?? 0;
  return (
    <div className="rounded-lg border bg-background shadow-lg px-3 py-2.5 text-xs space-y-1 min-w-[160px]">
      <p className="font-semibold">{label}</p>
      <div className="space-y-0.5">
        {(suspicious as number) > 0 && (
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />Suspicious flags</span>
            <span className="font-mono font-semibold text-red-600">{suspicious}</span>
          </div>
        )}
        {(audits as number) > 0 && (
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" />Audit actions</span>
            <span className="font-mono font-semibold text-blue-500">{audits}</span>
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
    return <ChartCardSkeleton metrics={2} chartHeight="h-48" />;
  }

  if (!data) return null;

  const TrendIcon = data.trend === "up" ? TrendingUp : data.trend === "down" ? TrendingDown : Minus;
  const trendColor = data.trend === "up" ? "text-red-600" : data.trend === "down" ? "text-emerald-600" : "text-muted-foreground";
  const trendLabel = data.trend === "up" ? "Recorded events increasing" : data.trend === "down" ? "Recorded events decreasing" : "Stable";

  const chartData = data.timeline;

  const avg = data.totalAnomalies > 0 && data.timeline.length > 0 ? data.totalAnomalies / data.timeline.length : 0;
  const peakDay = data.timeline.reduce((peak, day) => !peak || day.anomalyCount > peak.anomalyCount ? day : peak, data.timeline[0]);

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
            {peakDay && (
              <Badge variant="secondary" className="bg-red-100 text-red-700 text-[10px]">
                Peak: {peakDay.date} ({peakDay.anomalyCount})
              </Badge>
            )}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">Last 30 days · suspicious flags and recorded audit actions</p>
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
            <p className="text-sm font-bold mt-0.5">{peakDay?.date ?? "—"}</p>
            {peakDay && peakDay.anomalyCount > 0 && <p className="text-[9px] text-red-600 font-mono">{peakDay.anomalyCount} events</p>}
          </div>
          <div className="rounded-lg border px-3 py-2 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Daily avg</p>
            <p className="text-sm font-bold mt-0.5 font-mono">{avg.toFixed(1)}</p>
          </div>
        </div>

        {data.totalAnomalies === 0 ? (
          <div className="space-y-3">
            {/* Clean bill of health */}
            <div className="flex items-center gap-3 rounded-lg border bg-emerald-50/40 border-emerald-200 px-4 py-3">
              <ShieldCheck className="h-8 w-8 text-emerald-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-700">No matching events recorded in the last 30 days</p>
                <p className="text-[11px] text-muted-foreground">This view summarizes selected audit-log events; it does not establish that all trader activity was anomaly-free.</p>
              </div>
            </div>

            {/* What was checked */}
            <div className="grid grid-cols-1 gap-2">
              {[
                {
                  icon: "bg-amber-500",
                  label: "Suspicious flags",
                  desc: "The chart counts suspicious flags recorded in the audit log.",
                  result: "Clear",
                  resultColor: "text-emerald-600 bg-emerald-50 border-emerald-200",
                },
                {
                  icon: "bg-red-500",
                  label: "Audit actions",
                  desc: "The chart counts audit actions for the selected case workflow events.",
                  result: "Clear",
                  resultColor: "text-emerald-600 bg-emerald-50 border-emerald-200",
                },
                {
                  icon: "bg-blue-400",
                  label: "Scope",
                  desc: "This report is an audit-event summary, not a transaction anomaly detector.",
                  result: "Clear",
                  resultColor: "text-emerald-600 bg-emerald-50 border-emerald-200",
                },
              ].map(({ icon, label, desc, result, resultColor }) => (
                <div key={label} className="flex items-start gap-3 rounded-lg border px-3 py-2.5">
                  <span className={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${icon}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">{label}</p>
                    <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{desc}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border shrink-0 ${resultColor}`}>{result}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
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
                  <Area type="monotone" dataKey="suspiciousCount" stackId="1" stroke="#ef4444" strokeWidth={1.5} fill="url(#complianceGrad)" name="suspiciousCount" />
                  <Area type="monotone" dataKey="auditCount" stackId="1" stroke="#60a5fa" strokeWidth={1} fill="url(#gapsGrad)" name="auditCount" />
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
          </>
        )}
      </CardContent>
    </Card>
  );
}
