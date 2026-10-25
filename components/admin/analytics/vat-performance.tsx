"use client";

import { useEffect, useState } from "react";
import type { VatPerformanceData } from "@/app/api/admin/vat-performance/route";
import { formatCompact } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Inbox } from "lucide-react";
import { ChartCardSkeleton } from "@/components/admin/loading-skeletons";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function VatPerformance() {
  const [data, setData] = useState<VatPerformanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/vat-performance")
      .then((response) => (response.ok ? response.json() as Promise<VatPerformanceData> : null))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ChartCardSkeleton metrics={3} chartHeight="h-56" />;
  if (!data) return <p className="text-sm text-muted-foreground">VAT performance could not be loaded.</p>;
  const avgNet = data.monthly.length ? data.totalNet / data.monthly.length : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold"><BarChart3 className="h-4 w-4 text-muted-foreground" />VAT Performance</CardTitle>
        <p className="text-xs text-muted-foreground">Recorded output VAT, net VAT, and confirmed payments over the last six months</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Output VAT" value={`${formatCompact(data.totalOutput)} RWF`} />
          <Metric label="Net VAT" value={`${formatCompact(data.totalNet)} RWF`} />
          <Metric label="Confirmed payments" value={`${formatCompact(data.totalPaid)} RWF`} />
          <Metric label="Collection rate" value={`${data.collectionRate}%`} />
        </div>
        {data.monthly.length ? (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(value: number) => formatCompact(value)} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value) => `${formatCompact(Number(value ?? 0))} RWF`} />
                <Area type="monotone" dataKey="outputVat" name="Output VAT" stroke="#10b981" fill="#10b98133" />
                <Area type="monotone" dataKey="payments" name="Confirmed payments" stroke="#3b82f6" fill="#3b82f633" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : <div className="flex items-center justify-center gap-2 rounded-lg border bg-muted/20 py-8 text-sm text-muted-foreground"><Inbox className="h-5 w-5" />No VAT or payment records for this period.</div>}
        <p className="text-xs text-muted-foreground">Average monthly net VAT: {formatCompact(avgNet)} RWF</p>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border px-3 py-2"><p className="text-[10px] uppercase text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>;
}
