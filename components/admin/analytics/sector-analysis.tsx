"use client";

import { useEffect, useState } from "react";
import type { SectorAnalysisData } from "@/app/api/admin/sector-analysis/route";
import { formatCompact } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart2, Inbox } from "lucide-react";
import { ChartCardSkeleton } from "@/components/admin/loading-skeletons";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COLORS = ["#6366f1", "#0ea5e9", "#22c55e"];

export function SectorAnalysis() {
  const [data, setData] = useState<SectorAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/sector-analysis")
      .then((response) => (response.ok ? response.json() as Promise<SectorAnalysisData> : null))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ChartCardSkeleton metrics={2} chartHeight="h-56" />;
  if (!data) return <p className="text-sm text-muted-foreground">Sector analytics could not be loaded.</p>;

  const hasActivity = data.sectors.some((sector) => sector.vatGenerated > 0 || sector.taxPaid > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <BarChart2 className="h-4 w-4 text-muted-foreground" />
          Sector Analysis
          {data.topSector && <span className="ml-auto rounded border px-2 py-0.5 text-[10px] font-normal text-muted-foreground">Top: {data.topSector}</span>}
        </CardTitle>
        <p className="text-xs text-muted-foreground">Recorded VAT and confirmed tax payments by trader sector</p>
      </CardHeader>
      <CardContent>
        {hasActivity ? (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.sectors} margin={{ top: 8, right: 12, bottom: 0, left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="sector" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(value: number) => formatCompact(value)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value) => `${formatCompact(Number(value ?? 0))} RWF`} />
                <Bar dataKey="vatGenerated" name="Output VAT" radius={[5, 5, 0, 0]}>
                  {data.sectors.map((sector, index) => <Cell key={sector.sector} fill={COLORS[index % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-lg border bg-muted/20 py-8 text-sm text-muted-foreground">
            <Inbox className="h-6 w-6" />
            No recorded sector activity.
          </div>
        )}
        <div className="mt-4 space-y-2">
          {data.sectors.map((sector) => (
            <div key={sector.sector} className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs">
              <div>
                <p className="font-medium">{sector.sector}</p>
                <p className="text-muted-foreground">{sector.traderCount} traders · {sector.compliancePct}% paid against recorded VAT</p>
              </div>
              <div className="text-right">
                <p className="font-mono font-semibold">{formatCompact(sector.vatGenerated)} RWF VAT</p>
                <p className="text-muted-foreground">{formatCompact(sector.taxPaid)} RWF confirmed payments</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
