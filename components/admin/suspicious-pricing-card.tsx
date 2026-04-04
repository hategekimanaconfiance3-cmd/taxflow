"use client";

import { useEffect, useState } from "react";
import type { SuspiciousTransactionsData, SuspiciousFlag } from "@/lib/actions/suspicious-transactions.action";
import { formatCompact } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Copy,
  DollarSign,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  BarChart3,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Suspicious Pricing Detection — upgraded with explanations, baseline, drill-down
// ---------------------------------------------------------------------------

type CategoryKey = "below_market" | "extreme_drop" | "duplicate" | "below_cost" | "above_market";

interface PricingCategory {
  key: CategoryKey;
  icon: React.ReactNode;
  label: string;
  description: string;
  count: number;
  severityColor: string;
  bgColor: string;
  badgeColor: string;
}

function deviationLabel(unitPrice: number, marketMedian: number): string {
  if (marketMedian <= 0) return "";
  const pct = Math.round(Math.abs((unitPrice - marketMedian) / marketMedian) * 100);
  if (unitPrice < marketMedian) return `${pct}% below market average`;
  return `${pct}% above market average`;
}

function severityLabel(flag: SuspiciousFlag): string {
  if (flag.type === "extreme_drop") return "Extreme — likely VAT base manipulation";
  if (flag.type === "below_market") return "Below market — reduced VAT basis";
  if (flag.type === "below_cost") return "Below cost — selling at a loss";
  if (flag.type === "duplicate") return "Duplicate entry — possible double-posting";
  return "Anomaly detected";
}

function FlagDrillDown({ flags, type }: { flags: SuspiciousFlag[]; type: CategoryKey }) {
  const filtered = flags.filter(f => f.type === type).slice(0, 6);
  if (filtered.length === 0) return <p className="text-[11px] text-muted-foreground py-1 pl-1">No individual records to display.</p>;

  return (
    <div className="space-y-1.5 pt-1">
      {filtered.map((flag) => {
        const deviation = deviationLabel(flag.unitPrice, flag.marketMedian);
        const expectedMin = flag.marketMedian > 0 ? flag.marketMedian * 0.85 : null;
        const expectedMax = flag.marketMedian > 0 ? flag.marketMedian * 1.15 : null;

        return (
          <div key={flag.transactionId} className="rounded-md border bg-background px-2.5 py-2 text-[11px] space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold truncate">{flag.sellerName}</p>
              <Badge variant="secondary" className={`text-[9px] shrink-0 ${
                flag.severity === "high" ? "bg-red-100 text-red-700" :
                flag.severity === "medium" ? "bg-amber-100 text-amber-700" :
                "bg-blue-100 text-blue-700"
              }`}>{flag.severity}</Badge>
            </div>
            <p className="text-muted-foreground">{flag.productName}</p>
            <div className="flex items-center justify-between">
              <span className="text-red-600 font-mono font-semibold">{formatCompact(flag.unitPrice)} RWF</span>
              {flag.marketMedian > 0 && (
                <span className="text-muted-foreground font-mono">median: {formatCompact(flag.marketMedian)} RWF</span>
              )}
            </div>
            {deviation && (
              <p className="text-amber-600 font-medium">{deviation}</p>
            )}
            {expectedMin && expectedMax && (
              <p className="text-[10px] text-muted-foreground">
                Expected range: {formatCompact(expectedMin)} – {formatCompact(expectedMax)} RWF
              </p>
            )}
            <p className="text-[10px] text-muted-foreground italic">{severityLabel(flag)}</p>
          </div>
        );
      })}
    </div>
  );
}

export function SuspiciousPricingCard() {
  const [data, setData] = useState<SuspiciousTransactionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<CategoryKey>>(new Set());

  useEffect(() => {
    fetch("/api/admin/suspicious-transactions")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Scanning for suspicious pricing…</span>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const toggleCategory = (key: CategoryKey) => setExpanded(prev => {
    const n = new Set(prev);
    n.has(key) ? n.delete(key) : n.add(key);
    return n;
  });

  // Count above-market (price > 130% of median)
  const aboveMarketCount = data.recentFlags.filter(f => {
    // We don't have a direct "above_market" type in the action, treat it as derived
    return false; // future: extend action to include above_market
  }).length;

  const CATEGORIES: PricingCategory[] = [
    {
      key: "extreme_drop",
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      label: "Sudden price drops",
      description: "Price fell >50% below product median — strongest manipulation signal",
      count: data.extremePriceDrops,
      severityColor: "text-red-600",
      bgColor: "bg-red-50/70 border-red-200",
      badgeColor: "bg-red-100 text-red-700",
    },
    {
      key: "below_cost",
      icon: <TrendingDown className="h-3.5 w-3.5" />,
      label: "Below cost sales",
      description: "Selling below purchase price — likely to reduce VAT base artificially",
      count: data.recentFlags.filter(f => f.type === "below_cost").length,
      severityColor: "text-orange-600",
      bgColor: "bg-orange-50/70 border-orange-200",
      badgeColor: "bg-orange-100 text-orange-700",
    },
    {
      key: "below_market",
      icon: <TrendingDown className="h-3.5 w-3.5" />,
      label: "Below market price",
      description: "Price 15–50% below the product median for the last 90 days",
      count: data.belowMarketPrice,
      severityColor: "text-amber-600",
      bgColor: "bg-amber-50/70 border-amber-200",
      badgeColor: "bg-amber-100 text-amber-700",
    },
    {
      key: "above_market",
      icon: <TrendingUp className="h-3.5 w-3.5" />,
      label: "Above market price",
      description: "Price significantly above market — may indicate price ceiling violation",
      count: aboveMarketCount,
      severityColor: "text-blue-600",
      bgColor: "bg-blue-50/70 border-blue-200",
      badgeColor: "bg-blue-100 text-blue-700",
    },
    {
      key: "duplicate",
      icon: <Copy className="h-3.5 w-3.5" />,
      label: "Inconsistent/duplicate entries",
      description: "Same seller, product, and amount within 1 hour — possible double-posting",
      count: data.duplicateEntries,
      severityColor: "text-violet-600",
      bgColor: "bg-violet-50/70 border-violet-200",
      badgeColor: "bg-violet-100 text-violet-700",
    },
  ];

  const activeCategories = CATEGORIES.filter(c => c.count > 0);
  const highSeverityCount = data.recentFlags.filter(f => f.severity === "high").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-amber-500" />
            Suspicious Pricing Detection
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {data.totalSuspicious > 0 && (
              <Badge variant="secondary" className="bg-red-100 text-red-700 text-[10px]">
                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                {data.totalSuspicious} flagged
              </Badge>
            )}
            {highSeverityCount > 0 && (
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-[10px]">
                {highSeverityCount} high severity
              </Badge>
            )}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">Last 7 days · Click any category to drill down into individual transactions</p>
      </CardHeader>
      <CardContent className="space-y-3">

        {data.totalSuspicious === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-2 rounded-lg bg-emerald-50/40 border border-emerald-200">
            <ShieldCheck className="h-8 w-8 text-emerald-500" />
            <p className="text-sm font-medium text-emerald-700">No suspicious pricing detected</p>
            <p className="text-xs text-muted-foreground">All transactions within normal market ranges for the last 7 days</p>
          </div>
        ) : (
          <>
            {/* Market baseline summary */}
            <div className="flex items-start gap-2 rounded-lg border bg-muted/20 px-3 py-2.5">
              <BarChart3 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-[11px] font-semibold">Market Baseline</p>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Prices are compared against each product&apos;s 90-day rolling median.
                  Expected range: <span className="font-mono">±15%</span> from median.
                  Flagged when price deviates beyond threshold.
                </p>
              </div>
            </div>

            {/* Category rows — expandable drill-down */}
            <div className="space-y-1.5">
              {CATEGORIES.map((cat) => {
                const isExpanded = expanded.has(cat.key);
                const hasFlags = cat.count > 0;

                return (
                  <div key={cat.key} className={`rounded-lg border overflow-hidden ${hasFlags ? cat.bgColor : "border-muted/50 opacity-50"}`}>
                    <button
                      disabled={!hasFlags}
                      onClick={() => hasFlags && toggleCategory(cat.key)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors ${hasFlags ? "hover:bg-black/5 cursor-pointer" : "cursor-default"}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={cat.severityColor}>{cat.icon}</span>
                        <div className="min-w-0">
                          <p className={`text-xs font-semibold ${cat.severityColor}`}>{cat.label}</p>
                          <p className="text-[10px] text-muted-foreground leading-snug truncate">{cat.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="secondary" className={`text-[10px] font-bold ${cat.badgeColor}`}>{cat.count}</Badge>
                        {hasFlags && (isExpanded
                          ? <ChevronUp className={`h-3.5 w-3.5 ${cat.severityColor}`} />
                          : <ChevronDown className={`h-3.5 w-3.5 ${cat.severityColor}`} />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t px-3 pb-3">
                        <FlagDrillDown flags={data.recentFlags} type={cat.key} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Inactive categories note */}
            {activeCategories.length < CATEGORIES.length && (
              <p className="text-[10px] text-muted-foreground text-center">
                {CATEGORIES.length - activeCategories.length} category types show no anomalies this week
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
