"use client";

import { useEffect, useState } from "react";
import type { TransactionBehaviorData } from "@/app/api/admin/transaction-behavior/route";
import { formatCompact } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Inbox } from "lucide-react";
import { ChartCardSkeleton } from "@/components/admin/loading-skeletons";

export function TransactionBehavior() {
  const [data, setData] = useState<TransactionBehaviorData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/transaction-behavior")
      .then((response) => (response.ok ? response.json() as Promise<TransactionBehaviorData> : null))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ChartCardSkeleton metrics={3} chartHeight="h-40" />;
  if (!data) return <p className="text-sm text-muted-foreground">Transaction behavior could not be loaded.</p>;
  const peak = data.hourlyBuckets.reduce((best, item) => item.count > best.count ? item : best, { hour: 0, count: 0, totalAmount: 0 });

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4 text-muted-foreground" />Transaction Behavior<span className="ml-auto text-[10px] font-normal text-muted-foreground">Last 30 days</span></CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Transactions" value={data.totalTransactions.toLocaleString()} />
          <Metric label="Total value" value={`${formatCompact(data.totalAmount)} RWF`} />
          <Metric label="Average value" value={`${formatCompact(data.avgTransactionValue)} RWF`} />
          <Metric label="Peak hour" value={data.totalTransactions ? `${String(peak.hour).padStart(2, "0")}:00` : "—"} />
        </div>
        {data.topTraders.length ? (
          <div className="space-y-2">
            <p className="text-xs font-medium">Highest transaction counts by seller</p>
            {data.topTraders.map((trader) => (
              <div key={trader.businessId} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs">
                <span className="truncate font-medium">{trader.businessName}</span>
                <span className="shrink-0 text-right text-muted-foreground">{trader.txCount} transactions · {formatCompact(trader.totalAmount)} RWF</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-lg border bg-muted/20 py-6 text-sm text-muted-foreground"><Inbox className="h-5 w-5" />No seller transaction records for this period.</div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border px-3 py-2"><p className="text-[10px] uppercase text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>;
}
