"use client";

import { useEffect, useState } from "react";
import type {
  TransactionBehaviorData,
  HourlyBucket,
  TopTraderActivity,
} from "@/app/api/admin/transaction-behavior/route";
import { formatCompact } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Clock,
  TrendingUp,
  Users,
  Activity,
  Inbox,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Transaction Behavior Analytics
// Peak hours heatmap, KPIs, top trader activity
// ---------------------------------------------------------------------------

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function PeakHoursBar({ buckets, peakHour }: { buckets: HourlyBucket[]; peakHour: number }) {
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);

  // Group into 6-hour segments for readability
  const segments = [
    { label: "00–06", hours: buckets.slice(0, 6) },
    { label: "06–12", hours: buckets.slice(6, 12) },
    { label: "12–18", hours: buckets.slice(12, 18) },
    { label: "18–24", hours: buckets.slice(18, 24) },
  ];

  return (
    <div className="space-y-2">
      <div className="flex gap-1 items-end h-16">
        {buckets.map((bucket) => {
          const heightPct = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;
          const isPeak = bucket.hour === peakHour && bucket.count > 0;
          return (
            <div
              key={bucket.hour}
              className="flex-1 flex flex-col justify-end group relative"
              title={`${String(bucket.hour).padStart(2, "0")}:00: ${bucket.count} transactions`}
            >
              <div
                className={cn(
                  "rounded-sm transition-colors",
                  isPeak
                    ? "bg-violet-500"
                    : bucket.count > 0
                    ? "bg-violet-200 group-hover:bg-violet-300"
                    : "bg-muted/50"
                )}
                style={{ height: `${Math.max(heightPct, bucket.count > 0 ? 8 : 4)}%` }}
              />
            </div>
          );
        })}
      </div>
      {/* Segment labels */}
      <div className="flex text-[9px] text-muted-foreground/60 font-mono">
        {segments.map((seg) => (
          <span key={seg.label} className="flex-1 text-center">
            {seg.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5",
        highlight ? "bg-violet-50/60 border-violet-200" : "bg-muted/20"
      )}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={cn("h-3.5 w-3.5", highlight ? "text-violet-500" : "text-muted-foreground")} />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <p className={cn("text-base font-bold leading-none", highlight ? "text-violet-700" : "text-foreground")}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
    </div>
  );
}

function TopTradersTable({ traders }: { traders: TopTraderActivity[] }) {
  if (traders.length === 0) {
    return (
      <p className="text-xs text-muted-foreground/60 text-center py-3">
        No trader activity this week
      </p>
    );
  }

  const maxCount = Math.max(...traders.map((t) => t.txCount), 1);

  return (
    <div className="space-y-1.5">
      {traders.map((trader, i) => {
        const barWidth = (trader.txCount / maxCount) * 100;
        return (
          <div key={i} className="space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{trader.businessName}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-semibold tabular-nums">{trader.txCount} transactions</p>
                <p className="text-[9px] text-muted-foreground/70 font-mono">
                  {formatCompact(trader.totalAmount)} total
                </p>
              </div>
            </div>
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-violet-400"
                style={{ width: `${barWidth}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TransactionBehavior() {
  const [data, setData] = useState<TransactionBehaviorData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/transaction-behavior")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
          <span className="text-sm text-muted-foreground">Loading transaction behavior…</span>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const hasActivity = data.totalTransactions > 0;
  const peakBucket = data.hourlyBuckets.reduce((peak, bucket) => bucket.count > (peak?.count ?? 0) ? bucket : peak, data.hourlyBuckets[0]);
  const avgDailyVolume = Math.round(data.totalTransactions / 30);

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Transaction Behavior
          <Badge variant="secondary" className="text-[9px] h-4 px-1.5 font-normal ml-auto">
            Last 30 days
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-4">
        {/* ── KPI Strip ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <KpiCard
            icon={Zap}
            label="Transactions"
            value={formatCount(data.totalTransactions)}
            sub="last 30 days"
            highlight={false}
          />
          <KpiCard
            icon={TrendingUp}
            label="Daily Avg"
            value={avgDailyVolume > 0 ? formatCount(avgDailyVolume) : "—"}
            sub="daily average"
          />
          <KpiCard
            icon={Activity}
            label="Avg Value"
            value={data.avgTransactionValue > 0 ? formatCompact(data.avgTransactionValue) : "—"}
            sub="per transaction"
          />
          <KpiCard
            icon={Users}
            label="Top traders shown"
            value={String(data.topTraders.length)}
            sub="by transaction count"
          />
        </div>

        {!hasActivity ? (
          <div className="flex flex-col items-center justify-center py-6 gap-1 border rounded-lg bg-muted/20">
            <Inbox className="h-6 w-6 text-muted-foreground/40 mb-1" />
            <p className="text-xs font-medium text-muted-foreground">No transaction activity this week</p>
            <p className="text-[10px] text-muted-foreground/60">
              Peak hours and trader stats will appear once data is recorded
            </p>
          </div>
        ) : (
          <>
            {/* ── Peak Hours ── */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">Peak Activity Hours</span>
                </div>
                <span className="text-[10px] text-muted-foreground/70 font-mono">
                  Peak:{" "}
                  <span className="text-violet-600 font-semibold">
                    {String(peakBucket?.hour ?? 0).padStart(2, "0")}:00
                  </span>
                  {" "}· {peakBucket?.count ?? 0} transactions
                </span>
              </div>
              <PeakHoursBar buckets={data.hourlyBuckets} peakHour={peakBucket?.hour ?? 0} />
            </div>

            {/* ── Top Traders ── */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">Most Active Traders</span>
              </div>
              <TopTradersTable traders={data.topTraders} />
            </div>
          </>
        )}

      </CardContent>
    </Card>
  );
}
