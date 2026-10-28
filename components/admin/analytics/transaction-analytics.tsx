"use client";

import { useEffect, useState } from "react";
import type { TransactionBehaviorData } from "@/app/api/admin/transaction-behavior/route";
import { formatCompact } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Inbox } from "lucide-react";
import { ChartCardSkeleton } from "@/components/admin/loading-skeletons";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

// ---------------------------------------------------------------------------
// Section 4 — Transaction Analytics
// Daily trend AreaChart (30 days) + peak hours heatmap + top traders
// ---------------------------------------------------------------------------

interface TooltipArgs {
  active?: boolean;
  payload?: Array<{ value?: number; name?: string }>;
  label?: string;
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold mt-0.5">{value || "—"}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function TrendTooltip({ active, payload, label }: TooltipArgs) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background shadow-lg px-3 py-2.5 text-xs space-y-1 min-w-[140px]">
      <p className="font-semibold text-foreground">{label}</p>
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-blue-500" />
        <span className="text-muted-foreground">Transactions:</span>
        <span className="font-medium">{payload[0]?.value ?? 0}</span>
      </div>
      {payload[1] && (
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-muted-foreground">Value:</span>
          <span className="font-medium">{formatCompact(payload[1].value ?? 0)} RWF</span>
        </div>
      )}
    </div>
  );
}

export function TransactionAnalytics({ from, to }: { from?: string; to?: string } = {}) {
  const [data, setData] = useState<TransactionBehaviorData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    fetch(`/api/admin/transaction-behavior${qs ? `?${qs}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [from, to]);

  if (loading) return <ChartCardSkeleton metrics={3} chartHeight="h-56" />;


  if (!data) return null;

  const hasDailyData = data.hourlyBuckets.length > 0;
  const hasWeekData = data.totalTransactions > 0;
  const maxHourCount = Math.max(...data.hourlyBuckets.map((h) => h.count), 1);
  const peakBucket = [...data.hourlyBuckets].sort((a, b) => b.count - a.count)[0];
  const peakLabel = peakBucket ? `${String(peakBucket.hour).padStart(2, "0")}:00` : "—";

  // Thin the x-axis labels when there are many data points
  const tickInterval = 2;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Transaction Analytics
          <span className="ml-auto text-[10px] font-normal text-muted-foreground border rounded px-2 py-0.5">
            Last 30 days
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* ── Daily trend chart — PRIMARY FOCUS ──────────────────── */}
        {hasDailyData ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Transaction volume by hour · last 30 days</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={data.hourlyBuckets}
                  margin={{ top: 4, right: 16, bottom: 0, left: 16 }}
                >
                  <defs>
                    <linearGradient id="txnCountGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    interval={tickInterval}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                    allowDecimals={false}
                  />
                  <Tooltip content={<TrendTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    fill="url(#txnCountGrad)"
                    dot={false}
                    activeDot={{ r: 4, fill: "#3b82f6", stroke: "#fff", strokeWidth: 2 }}
                    name="Transactions"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 gap-2 rounded-lg bg-muted/20 border">
            <Inbox className="h-6 w-6 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No transaction data for the last 30 days</p>
          </div>
        )}

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            label="This Week"
            value={data.totalTransactions.toLocaleString()}
            sub="last 30 days"
          />
          <KpiCard
            label="Daily Average"
            value={(data.totalTransactions / 30).toFixed(1)}
            sub="daily average"
          />
          <KpiCard
            label="Avg Value"
            value={data.avgTransactionValue > 0 ? formatCompact(data.avgTransactionValue) : "—"}
            sub="per transaction"
          />
          <KpiCard
            label="Peak Hour"
            value={hasWeekData ? peakLabel : "—"}
            sub={hasWeekData ? `${peakBucket?.count ?? 0} txns at peak` : "No data in this period"}
          />
        </div>

        {hasWeekData && (
          <>
            {/* Peak hours heatmap */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Peak Activity Hours · last 7 days</p>
              <div className="flex gap-0.5 items-end h-10">
                {data.hourlyBuckets.map((bucket) => {
                  const heightPct = maxHourCount > 0 ? (bucket.count / maxHourCount) * 100 : 0;
                  const isPeak = bucket.hour === peakBucket?.hour && bucket.count > 0;
                  return (
                    <div
                      key={bucket.hour}
                      className="flex-1 flex flex-col justify-end group"
                      title={`${String(bucket.hour).padStart(2, "0")}:00: ${bucket.count} txns`}
                    >
                      <div
                        className={cn(
                          "rounded-sm transition-colors",
                          isPeak ? "bg-blue-500" : bucket.count > 0 ? "bg-blue-300/60 group-hover:bg-blue-400/70" : "bg-muted/40",
                        )}
                        style={{ height: `${Math.max(heightPct, bucket.count > 0 ? 20 : 8)}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex text-[9px] text-muted-foreground/50 font-mono justify-between">
                <span>00:00</span>
                <span>06:00</span>
                <span>12:00</span>
                <span>18:00</span>
                <span>23:00</span>
              </div>
            </div>

            {/* Top traders */}
            {data.topTraders.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Most Active Traders · last 7 days</p>
                {data.topTraders.slice(0, 3).map((t, i) => (
                  <div key={i} className="flex items-center justify-between text-xs rounded-lg border px-3 py-2.5">
                    <div className="min-w-0 flex items-center gap-2.5">
                      <span className="text-[10px] font-bold text-muted-foreground/40 tabular-nums w-4">#{i + 1}</span>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{t.businessName}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="font-semibold tabular-nums text-blue-600">{t.txCount} txns</p>
                      <p className="text-[10px] text-muted-foreground">{formatCompact(t.totalAmount)} total</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
