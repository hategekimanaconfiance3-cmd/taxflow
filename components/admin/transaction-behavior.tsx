"use client";

import { useEffect, useState } from "react";
import type { TransactionBehaviorData } from "@/app/api/admin/transaction-behavior/route";
import { formatCompact } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Inbox } from "lucide-react";

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

  return (
    <Card>
      <CardHeader className="px-4 pb-2 pt-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Transaction Behavior
          <span className="ml-auto rounded border px-2 py-0.5 text-[9px] font-normal">Last 30 days</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4">
        {loading ? <p className="text-sm text-muted-foreground">Loading transaction behavior…</p>
          : !data ? <p className="text-sm text-muted-foreground">Transaction behavior is unavailable.</p>
            : data.totalTransactions === 0 ? (
              <div className="flex flex-col items-center gap-1 rounded-lg border bg-muted/20 py-6">
                <Inbox className="mb-1 h-6 w-6 text-muted-foreground/40" />
                <p className="text-xs font-medium text-muted-foreground">No transaction activity in the last 30 days</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Metric label="Transactions" value={data.totalTransactions.toLocaleString()} />
                  <Metric label="Total value" value={`${formatCompact(data.totalAmount)} RWF`} />
                  <Metric label="Average value" value={`${formatCompact(data.avgTransactionValue)} RWF`} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xs font-medium">Transaction count by hour · last 30 days</h3>
                  <div className="flex h-16 items-end gap-1" aria-label="Transaction counts by hour">
                    {data.hourlyBuckets.map((bucket) => {
                      const maximum = Math.max(...data.hourlyBuckets.map((hour) => hour.count), 1);
                      const height = bucket.count ? Math.max(8, bucket.count / maximum * 100) : 4;
                      return <div key={bucket.hour} title={`${String(bucket.hour).padStart(2, "0")}:00 · ${bucket.count} transactions`} className="flex-1 rounded-t-sm bg-violet-400" style={{ height: `${height}%` }} />;
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xs font-medium">Most active sellers · last 30 days</h3>
                  {data.topTraders.map((trader) => (
                    <div key={trader.businessId} className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-xs">
                      <span className="truncate font-medium">{trader.businessName}</span>
                      <span className="shrink-0 text-right">{trader.txCount} transactions · {formatCompact(trader.totalAmount)} RWF</span>
                    </div>
                  ))}
                </div>
              </>
            )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-muted/20 px-3 py-2.5"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-bold">{value}</p></div>;
}
