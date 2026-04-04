"use client";

import { useEffect, useState } from "react";
import type { EconomicStatsData } from "@/lib/actions/economic-stats.action";
import { formatCompact } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe, TrendingUp, TrendingDown, Inbox, Star } from "lucide-react";
import { EconomicSkeleton } from "@/components/admin/loading-skeletons";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";

// ---------------------------------------------------------------------------
// Section 6 — Economic Intelligence (simplified)
// Top products bar chart + sector activity summary
// ---------------------------------------------------------------------------

const PRODUCT_COLORS = ["#6366f1", "#0ea5e9", "#22c55e", "#f59e0b", "#f97316"];

export function EconomicSummary() {
  const [data, setData] = useState<EconomicStatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/economic-stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <EconomicSkeleton />;

  if (!data) return null;

  const hasProducts = data.topProducts.length > 0;
  const hasSectors = data.sectorActivity.length > 0;
  const totalProductValue = data.topProducts.reduce((sum, p) => sum + p.value, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          Economic Intelligence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Top products bar chart */}
        {hasProducts ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Top Products by Transaction Volume</p>
              <span className="flex items-center gap-1 text-[10px] text-amber-500 font-medium">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {data.topProducts[0]?.name}
              </span>
            </div>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.topProducts}
                  layout="vertical"
                  margin={{ top: 0, right: 56, bottom: 0, left: 0 }}
                  barSize={18}
                  barCategoryGap="20%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => formatCompact(v)}
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    width={96}
                  />
                  <Tooltip
                    formatter={(v) => {
                      const n = Number(v);
                      const pct = totalProductValue > 0 ? Math.round((n / totalProductValue) * 100) : 0;
                      return [`${formatCompact(n)} RWF (${pct}%)`, "Value"] as [string, string];
                    }}
                    contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} name="Value" label={{ position: "right", fontSize: 9, fill: "hsl(var(--muted-foreground))", formatter: ((v: number) => totalProductValue > 0 ? `${Math.round((v / totalProductValue) * 100)}%` : "") as any }}>
                    {data.topProducts.map((_, i) => (
                      <Cell
                        key={i}
                        fill={PRODUCT_COLORS[i % PRODUCT_COLORS.length]}
                        opacity={i === 0 ? 1 : 0.72}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 gap-2 rounded-lg bg-muted/20 border">
            <Inbox className="h-6 w-6 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">No product activity to display</p>
          </div>
        )}

        {/* Sector activity summary */}
        {hasSectors && (() => {
          const totalSectorValue = data.sectorActivity.reduce((sum, s) => sum + s.totalValue, 0);
          return (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Sector Activity · last 30 days</p>
              {data.sectorActivity.map((s) => {
                const pct = totalSectorValue > 0 ? Math.round((s.totalValue / totalSectorValue) * 100) : 0;
                return (
                  <div key={s.role} className="flex items-center justify-between text-xs rounded-lg border px-3 py-2.5">
                    <div>
                      <p className="font-medium">{s.label}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {s.traderCount} traders · {s.transactionCount} txns
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold font-mono">{formatCompact(s.totalValue)} <span className="text-[10px] text-muted-foreground font-normal">({pct}%)</span></p>
                      <p className="text-[10px] text-emerald-600 font-mono">
                        {formatCompact(s.vatGenerated)} VAT
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Price changes */}
        {data.priceChanges.length > 0 && (
          <div className="space-y-1.5 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">Notable Price Changes</p>
            {data.priceChanges.slice(0, 3).map((p) => (
              <div key={p.productName} className="flex items-center justify-between text-xs">
                <span className="truncate text-muted-foreground">{p.productName}</span>
                <span className={`font-mono font-semibold shrink-0 ml-2 ${
                  p.changePercent >= 0 ? "text-emerald-600" : "text-red-600"
                }`}>
                  {p.changePercent >= 0 ? "+" : ""}{p.changePercent}%
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
