"use client";

import { useEffect, useState } from "react";
import type { SectorAnalysisData } from "@/app/api/admin/sector-analysis/route";
import { formatCompact } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart2, Inbox } from "lucide-react";
import { ChartCardSkeleton } from "@/components/admin/loading-skeletons";
import Link from "next/link";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
} from "recharts";

// ---------------------------------------------------------------------------
// Section 3 — Sector Analysis (Manufacturing / Wholesale / Retail)
// ---------------------------------------------------------------------------

interface TooltipArgs {
  active?: boolean;
  payload?: Array<{ value?: number; color?: string; name?: string }>;
  label?: string;
}

const SECTOR_COLORS: Record<string, string> = {
  Manufacturer: "#6366f1",
  Wholesaler: "#0ea5e9",
  Retailer: "#22c55e",
};

function SectorTooltip({ active, payload, label }: TooltipArgs) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  // Find growth from sector data injected as extra payload name
  return (
    <div className="rounded-lg border bg-background shadow-lg px-3 py-2.5 text-xs space-y-1.5 min-w-[160px]">
      <p className="font-semibold text-foreground">{label}</p>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">VAT contribution</span>
        <span className="font-medium" style={{ color: d?.color }}>{formatCompact(d?.value ?? 0)} RWF</span>
      </div>
      {payload[1] && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Share of total</span>
          <span className="font-semibold">{payload[1].value}%</span>
        </div>
      )}
    </div>
  );
}

export function SectorAnalysis({ from, to }: { from?: string; to?: string } = {}) {
  const [data, setData] = useState<SectorAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    fetch(`/api/admin/sector-analysis${qs ? `?${qs}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [from, to]);

  if (loading) return <ChartCardSkeleton metrics={3} chartHeight="h-56" />;

  if (!data) return null;

  const hasData = data.sectors.some((s) => s.vatGenerated > 0);
  const totalVat = data.sectors.reduce((total, sector) => total + sector.vatGenerated, 0);
  const chartData = data.sectors.map((sector) => ({
    ...sector,
    label: sector.sector,
    vatPct: totalVat > 0 ? Math.round((sector.vatGenerated / totalVat) * 100) : 0,
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-muted-foreground" />
              Sector Analysis
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Recorded VAT and confirmed payments by trader sector
            </p>
          </div>
          {data.topSector && (
            <span className="text-[10px] text-muted-foreground border rounded px-2 py-0.5">
              Top: {data.topSector}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasData ? (
          <>
            {/* Bar chart */}
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 24, right: 16, bottom: 0, left: 16 }}
                  barSize={64}
                  barCategoryGap="30%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => formatCompact(v)}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    width={68}
                  />
                  <Tooltip content={<SectorTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
                  <Bar dataKey="vatGenerated" radius={[6, 6, 0, 0]} name="Output VAT">
                    <LabelList
                      dataKey="vatPct"
                      position="top"
                      formatter={(value: unknown) => typeof value === "number" && value > 0 ? `${value}%` : ""}
                      style={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" }}
                    />
                    {data.sectors.map((s) => (
                      <Cell
                      key={s.sector}
                      fill={SECTOR_COLORS[s.sector] ?? "#6366f1"}
                      opacity={s.vatGenerated > 0 ? 1 : 0.3}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Sector stat rows */}
            <div className="space-y-2">
              {data.sectors.map((s) => (
                <Link
                  key={s.sector}
                  href={`/admin/traders?role=${s.sector.toLowerCase()}`}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-muted/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: SECTOR_COLORS[s.sector] ?? "#888" }}
                    />
                    <div>
                      <p className="text-xs font-medium">{s.sector}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {s.traderCount} traders · {formatCompact(s.taxPaid)} RWF confirmed payments
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {s.vatGenerated > 0 ? (
                      <>
                        <p className="text-xs font-semibold font-mono">{formatCompact(s.vatGenerated)} RWF output VAT</p>
                        <p className="text-[10px] text-muted-foreground/50">{s.compliancePct}% payments-to-output-VAT ratio</p>
                      </>
                    ) : (
                      <p className="text-[10px] italic text-muted-foreground/50">No activity recorded</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 gap-2 rounded-lg bg-muted/20 border">
            <Inbox className="h-7 w-7 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No sector transactions in the last 30 days</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
