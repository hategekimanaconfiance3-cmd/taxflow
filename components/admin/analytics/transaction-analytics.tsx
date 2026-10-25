"use client";

import { useEffect, useState } from "react";
import type { TransactionBehaviorData } from "@/app/api/admin/transaction-behavior/route";
import { formatCompact } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Inbox } from "lucide-react";
import { ChartCardSkeleton } from "@/components/admin/loading-skeletons";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function TransactionAnalytics() {
  const [data, setData] = useState<TransactionBehaviorData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/transaction-behavior")
      .then((response) => (response.ok ? response.json() as Promise<TransactionBehaviorData> : null))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ChartCardSkeleton metrics={3} chartHeight="h-56" />;
  if (!data) return <p className="text-sm text-muted-foreground">Transaction analytics could not be loaded.</p>;

  const peak = data.hourlyBuckets.reduce((best, item) => item.count > best.count ? item : best, { hour: 0, count: 0, totalAmount: 0 });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Transaction Analytics
          <span className="ml-auto rounded border px-2 py-0.5 text-[10px] font-normal text-muted-foreground">Last 30 days</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Transactions" value={data.totalTransactions.toLocaleString()} />
          <Metric label="Transaction value" value={`${formatCompact(data.totalAmount)} RWF`} />
          <Metric label="Average value" value={`${formatCompact(data.avgTransactionValue)} RWF`} />
          <Metric label="Busiest recorded hour" value={data.totalTransactions ? `${String(peak.hour).padStart(2, "0")}:00` : "—"} />
        </div>
        {data.totalTransactions ? (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.hourlyBuckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="hour" tickFormatter={(value: number) => `${String(value).padStart(2, "0")}:00`} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip labelFormatter={(value) => `${String(value).padStart(2, "0")}:00`} />
                <Area type="monotone" dataKey="count" name="Transactions" stroke="#3b82f6" fill="#3b82f633" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : <Empty />}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border px-3 py-2"><p className="text-[10px] uppercase text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>;
}

function Empty() {
  return <div className="flex items-center justify-center gap-2 rounded-lg border bg-muted/20 py-8 text-sm text-muted-foreground"><Inbox className="h-5 w-5" />No transactions recorded in this period.</div>;
}
