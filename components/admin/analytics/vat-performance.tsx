"use client";

import { useEffect, useState } from "react";
import type { VatPerformanceData } from "@/app/api/admin/vat-performance/route";
import { formatCompact } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, BarChart3, Inbox } from "lucide-react";
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
// Section 1 — Revenue & Tax Performance (full width)
// ---------------------------------------------------------------------------

interface TooltipArgs {
  active?: boolean;
  payload?: Array<{ value?: number; name?: string; color?: string }>;
  label?: string;
}

function MetricCard({
  label,
  value,
  sub,
  change,
  positive,
}: {
  label: string;
  value: string;
  sub?: string;
  change?: number | null;
  positive?: boolean;
}) {
  const hasChange = change !== null && change !== undefined;
  return (
    <div className="rounded-xl border bg-card px-5 py-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-1 tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      {hasChange && (
        <div className={`flex items-center gap-1 mt-1.5 text-xs font-medium ${
          positive ? "text-emerald-600" : change < 0 ? "text-red-600" : "text-muted-foreground"
        }`}>
          {change > 0 ? <TrendingUp className="h-3 w-3" /> : change < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          {change > 0 ? `+${change}%` : `${change}%`} vs previous period
        </div>
      )}
    </div>
  );
}

function VatTooltip({ active, payload, label }: TooltipArgs) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background shadow-lg px-3 py-2.5 text-xs space-y-1">
      <p className="font-semibold text-foreground">{label}</p>
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <span className="text-muted-foreground">Confirmed tax payments:</span>
        <span className="font-medium text-emerald-600">{formatCompact(payload[0]?.value ?? 0)} RWF</span>
      </div>
    </div>
  );
}

export function VatPerformance({ from, to }: { from?: string; to?: string } = {}) {
  const [data, setData] = useState<VatPerformanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    fetch(`/api/admin/vat-performance${qs ? `?${qs}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [from, to]);

  if (loading) return <ChartCardSkeleton metrics={3} chartHeight="h-64" />;

  if (!data) return null;

  const hasData = data.monthly.length > 0;
  const avgMonthlyPayment = hasData ? data.totalPaid / data.monthly.length : 0;
  const currentPeriod = data.monthly[data.monthly.length - 1];
  const peakPeriod = data.monthly.reduce((peak, point) => point.payments > (peak?.payments ?? 0) ? point : peak, data.monthly[0]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Tax Payment Performance
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Confirmed tax payments recorded by month</p>
          </div>
          {peakPeriod && peakPeriod.payments > 0 && (
            <span className="text-[10px] text-muted-foreground border rounded px-2 py-0.5">
              Highest: {peakPeriod.month}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Metric strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MetricCard
            label="Confirmed tax payments"
            value={formatCompact(data.totalPaid)}
            sub="Current chart period"
          />
          <MetricCard
            label="Latest month"
            value={currentPeriod && currentPeriod.payments > 0 ? formatCompact(currentPeriod.payments) : "—"}
            sub={currentPeriod?.month ?? "No monthly payment records"}
          />
          <MetricCard
            label="Monthly average"
            value={formatCompact(avgMonthlyPayment)}
            sub={`Across ${data.monthly.length} recorded months`}
          />
        </div>

        {/* Area chart */}
        {hasData ? (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data.monthly}
                margin={{ top: 8, right: 20, bottom: 0, left: 20 }}
              >
                <defs>
                  <linearGradient id="vatGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  padding={{ left: 8, right: 8 }}
                />
                <YAxis
                  tickFormatter={(v) => formatCompact(v)}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  width={72}
                />
                {avgMonthlyPayment > 0 && (
                  <ReferenceLine
                    y={avgMonthlyPayment}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 3"
                    strokeWidth={1}
                    label={{
                      value: "avg",
                      position: "insideTopRight",
                      fontSize: 9,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                  />
                )}
                <Tooltip content={<VatTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
                <Area
                  type="monotone"
                  dataKey="payments"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fill="url(#vatGradient)"
                  dot={{ r: 3.5, fill: "#10b981", strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#10b981", stroke: "#fff", strokeWidth: 2 }}
                  name="Confirmed tax payments"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 gap-2 rounded-lg bg-muted/20 border">
            <Inbox className="h-7 w-7 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No monthly records are available for the past six months</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
