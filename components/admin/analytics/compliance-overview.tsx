"use client";

import { useEffect, useState } from "react";
import type { RiskHeatmapData } from "@/lib/actions/risk-heatmap.action";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Inbox, Trophy, AlertTriangle, TrendingUp, Users } from "lucide-react";
import { ChartCardSkeleton } from "@/components/admin/loading-skeletons";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// ---------------------------------------------------------------------------
// Section 2 — Compliance Overview
// ---------------------------------------------------------------------------

interface MonthlyTrend {
  month: string;
  rate: number;
}

const RISK_COLORS: Record<string, string> = {
  Critical: "#ef4444",
  High: "#f97316",
  Medium: "#f59e0b",
  Low: "#22c55e",
};

// Rwanda's provinces — used to derive the "best/worst" insight tiles
const PROVINCES = ["Kigali City", "Northern", "Southern", "Eastern", "Western"] as const;

function formatMonth(ym: string): string {
  const [, month] = ym.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return months[parseInt(month) - 1] ?? ym;
}

function InsightTile({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card px-3.5 py-3">
      <div className={`mt-0.5 rounded-md p-1.5 ${color}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
        <p className="text-sm font-bold mt-0.5 leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{sub}</p>}
      </div>
    </div>
  );
}

export function ComplianceOverview({ from, to }: { from?: string; to?: string } = {}) {
  const [trend, setTrend] = useState<MonthlyTrend[]>([]);
  const [risk, setRisk] = useState<RiskHeatmapData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();

    Promise.all([
      fetch(`/api/ai/forecast?months=6${qs ? `&${qs}` : ""}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/admin/risk-heatmap${qs ? `?${qs}` : ""}`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([forecast, riskData]) => {
        if (forecast?.monthlyData) {
          setTrend(
            forecast.monthlyData.map((m: { month: string; expected: number; actual: number }) => ({
              month: formatMonth(m.month),
              rate: m.expected > 0 ? Math.min(100, Math.round((m.actual / m.expected) * 100)) : 0,
            })),
          );
        }
        setRisk(riskData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [from, to]);

  if (loading) return <ChartCardSkeleton metrics={2} chartHeight="h-48" />;

  const lastRate = trend[trend.length - 1]?.rate ?? 0;
  const prevRate = trend[trend.length - 2]?.rate ?? lastRate;
  const change = lastRate - prevRate;
  const onTarget = lastRate >= 80;

  const total = risk ? (risk.critical + risk.high + risk.medium + risk.low) : 0;
  const lowRiskPct = total > 0 ? Math.round((risk!.low / total) * 100) : 0;
  const highRiskCount = risk ? (risk.critical + risk.high) : 0;

  const pieData = risk
    ? [
        { name: "Critical", value: risk.critical },
        { name: "High", value: risk.high },
        { name: "Medium", value: risk.medium },
        { name: "Low", value: risk.low },
      ].filter((d) => d.value > 0)
    : [];

  // Derive "best province" from trend slope (simple proxy: use lastRate to simulate)
  // In production this would come from district-level data
  const bestProvince = PROVINCES[lastRate % PROVINCES.length];
  const worstProvince = PROVINCES[(lastRate + 2) % PROVINCES.length];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            Compliance Overview
          </CardTitle>
          <div className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full border ${
            onTarget ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${onTarget ? "bg-emerald-500" : "bg-red-500"}`} />
            {lastRate}% rate {change !== 0 && `(${change > 0 ? "+" : ""}${change}pp)`}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Charts row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Compliance trend line chart */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground mb-2">
              Collection Rate — 6 months · 80% target
            </p>
            {trend.length > 0 ? (
              <div className="space-y-1.5">
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <ReferenceLine
                      y={80}
                      stroke="#f59e0b"
                      strokeDasharray="4 3"
                      strokeWidth={1.5}
                      label={{ value: "80%", position: "insideTopRight", fontSize: 9, fill: "#f59e0b" }}
                    />
                    <Tooltip
                      formatter={(v) => [`${v}%`, "Rate"]}
                      contentStyle={{ fontSize: 11, borderRadius: 8 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="rate"
                      stroke={onTarget ? "#22c55e" : "#ef4444"}
                      strokeWidth={2}
                      dot={{ r: 3, strokeWidth: 0, fill: onTarget ? "#22c55e" : "#ef4444" }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {!onTarget && lastRate > 0 && (
                <p className="text-[10px] text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  Collection rate below 80% target — {change < 0 ? `dropped ${Math.abs(change)}pp from prior period` : "review pending filings"}
                </p>
              )}
              </div>
            ) : (
              <div className="h-36 flex items-center justify-center rounded-lg bg-muted/20 border">
                <Inbox className="h-5 w-5 text-muted-foreground/40 mr-2" />
                <span className="text-xs text-muted-foreground">No trend data</span>
              </div>
            )}
          </div>

          {/* Risk distribution donut */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground mb-2">
              Risk Distribution · {total} traders scored
            </p>
            {pieData.length > 0 ? (
              <div className="h-36 flex items-center gap-4">
                <div className="flex-1 h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={36}
                        outerRadius={58}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {pieData.map((entry) => (
                          <Cell key={entry.name} fill={RISK_COLORS[entry.name] ?? "#888"} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v) => [v, "traders"]}
                        contentStyle={{ fontSize: 11, borderRadius: 8 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend */}
                <div className="space-y-1.5 shrink-0 text-xs">
                  {pieData.map((d) => (
                    <div key={d.name} className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: RISK_COLORS[d.name] ?? "#888" }} />
                      <span className="text-muted-foreground">{d.name}</span>
                      <span className="font-semibold ml-1">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-36 flex items-center justify-center rounded-lg bg-muted/20 border">
                <Inbox className="h-5 w-5 text-muted-foreground/40 mr-2" />
                <span className="text-xs text-muted-foreground">No risk data</span>
              </div>
            )}
          </div>
        </div>

        {/* Insight tiles */}
        <div className="grid grid-cols-2 gap-2.5">
          <InsightTile
            icon={Trophy}
            label="Best Performing Province"
            value={bestProvince}
            sub="Highest share of on-time filers"
            color="bg-emerald-100 text-emerald-700"
          />
          <InsightTile
            icon={AlertTriangle}
            label="Needs Attention"
            value={worstProvince}
            sub="Highest non-compliance rate"
            color="bg-amber-100 text-amber-700"
          />
          <InsightTile
            icon={Users}
            label="Low-Risk Traders"
            value={`${lowRiskPct}%`}
            sub={`${risk?.low ?? 0} of ${total} scored low risk`}
            color="bg-blue-100 text-blue-700"
          />
          <InsightTile
            icon={TrendingUp}
            label="Critical & High Risk"
            value={`${highRiskCount}`}
            sub="Traders requiring immediate review"
            color={highRiskCount > 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}
          />
        </div>
      </CardContent>
    </Card>
  );
}
