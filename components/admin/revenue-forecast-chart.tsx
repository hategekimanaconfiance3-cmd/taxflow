"use client";

import { useEffect, useState } from "react";
import type { RevenueForecast } from "@/lib/ai/revenue-forecast";
import { formatCompact } from "@/lib/utils";
import { ForecastCardSkeleton } from "@/components/admin/loading-skeletons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Brain,
  AlertTriangle,
  Gauge,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Zap,
  ShieldAlert,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Revenue Forecast Chart — Active Intelligence Version
// ---------------------------------------------------------------------------

function formatMonth(ym: string): string {
  const [year, month] = ym.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(month) - 1]} ${year}`;
}

function buildExplanation(forecast: RevenueForecast): string {
  if (forecast.trend === "growing") {
    const monthsWithGrowth = forecast.monthlyData.filter((m, i, arr) =>
      i > 0 && m.actual > arr[i - 1].actual
    ).length;
    if (monthsWithGrowth >= 3) {
      return "Revenue is on a consistent upward trajectory over the last 3+ months, driven by improved payment compliance and increased transaction volume.";
    }
    return "Revenue trending upward. Recent months show stronger actual collections versus expected amounts.";
  }
  if (forecast.trend === "declining") {
    if (forecast.gapPercentage > 30) {
      return `Revenue declining significantly — ${forecast.gapPercentage}% gap between expected and collected. Likely driven by ${forecast.gapCauses[0]?.toLowerCase() ?? "reduced trader activity"}.`;
    }
    return "Revenue showing a downward trend. Collection is falling behind projected amounts — monitor for systematic underreporting.";
  }
  return "Revenue is stable. Collections are tracking close to expected amounts with no significant deviation.";
}

function computeDataCompleteness(forecast: RevenueForecast): number {
  const withData = forecast.monthlyData.filter(m => m.actual > 0 || m.expected > 0).length;
  return forecast.monthlyData.length > 0
    ? Math.round((withData / forecast.monthlyData.length) * 100)
    : 0;
}

function computeHistoricalConsistency(forecast: RevenueForecast): number {
  const months = forecast.monthlyData.filter(m => m.expected > 0);
  if (months.length < 2) return 0;
  const ratios = months.map(m => Math.min(m.actual / m.expected, 2));
  const avg = ratios.reduce((s, r) => s + r, 0) / ratios.length;
  const variance = ratios.reduce((s, r) => s + Math.pow(r - avg, 2), 0) / ratios.length;
  const stdDev = Math.sqrt(variance);
  return Math.max(0, Math.round((1 - Math.min(stdDev, 1)) * 100));
}

export function RevenueForecastChart() {
  const [forecast, setForecast] = useState<RevenueForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [showScenarios, setShowScenarios] = useState(false);
  const [showConfidence, setShowConfidence] = useState(false);

  useEffect(() => {
    fetch("/api/ai/forecast?months=6")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setForecast(data))
      .catch(() => setForecast(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <ForecastCardSkeleton />;
  }

  if (!forecast) return null;

  const maxValue = Math.max(...forecast.monthlyData.map(m => Math.max(m.expected, m.actual)), 1);
  const TrendIcon = forecast.trend === "growing" ? TrendingUp : forecast.trend === "declining" ? TrendingDown : Minus;
  const trendColor = forecast.trend === "growing" ? "text-emerald-600" : forecast.trend === "declining" ? "text-red-600" : "text-muted-foreground";
  const confidence = forecast.confidence ?? 0;
  const confidenceColor = confidence >= 70 ? "bg-emerald-100 text-emerald-700" : confidence >= 40 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
  const isLowDataVolume = forecast.monthlyData.filter(m => m.actual > 0).length < 3;
  const dataCompleteness = computeDataCompleteness(forecast);
  const historicalConsistency = computeHistoricalConsistency(forecast);

  // Scenario simulations
  const compliance10Scenario = Math.round(forecast.projectedNextMonth * 1.1);
  const compliance20Scenario = Math.round(forecast.projectedNextMonth * 1.2);
  const pendingConfirmedGain = forecast.topGapContributors.slice(0, 5).reduce((s, c) => s + c.gap * 0.4, 0);
  const explanation = buildExplanation(forecast);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Brain className="h-4 w-4 text-violet-500" />
            AI Revenue Forecast
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className={`text-[10px] ${confidenceColor}`}>
              <Gauge className="h-2.5 w-2.5 mr-0.5" />
              {confidence}% confidence
            </Badge>
            <div className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
              <TrendIcon className="h-3.5 w-3.5" />
              {forecast.trend === "growing" ? "Growing" : forecast.trend === "declining" ? "Declining" : "Stable"}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Low data warning */}
        {isLowDataVolume && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5">
            <ShieldAlert className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700">
              <span className="font-semibold">Forecast reliability low</span> — fewer than 3 months of actual data available. Results are indicative only.
            </p>
          </div>
        )}

        {/* AI Explanation */}
        <div className="rounded-lg border border-violet-200 bg-violet-50/40 px-3 py-2.5 flex items-start gap-2">
          <Lightbulb className="h-4 w-4 text-violet-500 mt-0.5 shrink-0" />
          <p className="text-xs text-violet-800 leading-relaxed">{explanation}</p>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Expected</p>
            <p className="text-sm font-bold font-mono mt-1">{formatCompact(forecast.expectedRevenue)}</p>
            <p className="text-[9px] text-muted-foreground">VAT output</p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Collected</p>
            <p className="text-sm font-bold font-mono text-emerald-600 mt-1">{formatCompact(forecast.actualRevenue)}</p>
            <p className="text-[9px] text-muted-foreground">Confirmed payments</p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gap</p>
            <p className={`text-sm font-bold font-mono mt-1 ${forecast.gap > 0 ? "text-red-600" : "text-emerald-600"}`}>
              {forecast.gap > 0 ? "-" : "+"}{formatCompact(Math.abs(forecast.gap))}
            </p>
            <p className="text-[9px] text-muted-foreground">{forecast.gapPercentage}% gap</p>
          </div>
        </div>

        {/* Gap causes */}
        {forecast.gapCauses.length > 0 && forecast.gap > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Gap Analysis — Why revenue is below target
            </p>
            <ul className="space-y-0.5">
              {forecast.gapCauses.map((cause, i) => (
                <li key={i} className="text-[11px] text-amber-700 flex items-start gap-1.5">
                  <span className="text-amber-400 mt-0.5 shrink-0">•</span>
                  {cause}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Monthly bars */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Monthly Breakdown · Expected vs Collected</p>
          <div className="space-y-3">
            {forecast.monthlyData.map((m) => {
              const expectedPct = (m.expected / maxValue) * 100;
              const actualPct = (m.actual / maxValue) * 100;
              const gapPct = m.expected > 0 ? Math.round(((m.expected - m.actual) / m.expected) * 100) : 0;
              return (
                <div key={m.month} className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-medium">{formatMonth(m.month)}</span>
                    <span className={`font-mono ${gapPct > 15 ? "text-red-500" : gapPct > 5 ? "text-amber-500" : "text-emerald-600"}`}>
                      {gapPct > 0 ? `-${gapPct}% gap` : "on target"}
                    </span>
                  </div>
                  <div className="relative h-2 rounded-full bg-muted/30">
                    <div className="absolute inset-y-0 left-0 rounded-full bg-blue-200/70" style={{ width: `${expectedPct}%` }} />
                    <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-500/80" style={{ width: `${actualPct}%` }} />
                  </div>
                  <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
                    <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" />{formatCompact(m.actual)} collected</span>
                    <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-300 mr-1" />{formatCompact(m.expected)} expected · {m.traderCount} traders</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Projected next month */}
        <div className="rounded-lg border border-dashed p-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium">Projected Next Month</p>
            <p className="text-[10px] text-muted-foreground">Linear regression on actual collections</p>
          </div>
          <p className="text-sm font-bold font-mono">{formatCompact(forecast.projectedNextMonth)}</p>
        </div>

        {/* Scenario simulation — collapsible */}
        <div className="rounded-lg border overflow-hidden">
          <button
            onClick={() => setShowScenarios(s => !s)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-violet-500" />
              <span className="text-xs font-semibold">Scenario Simulation</span>
              <Badge variant="secondary" className="text-[9px] bg-violet-100 text-violet-700">What-if</Badge>
            </div>
            {showScenarios ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          {showScenarios && (
            <div className="border-t px-3 pb-3 space-y-2 pt-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded-md border bg-emerald-50/40 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground font-medium">If compliance improves 10%</p>
                  <p className="text-sm font-bold text-emerald-700 font-mono mt-0.5">{formatCompact(compliance10Scenario)} RWF</p>
                  <p className="text-[9px] text-muted-foreground">+{formatCompact(compliance10Scenario - forecast.projectedNextMonth)} RWF above projection</p>
                </div>
                <div className="rounded-md border bg-emerald-50/40 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground font-medium">If compliance improves 20%</p>
                  <p className="text-sm font-bold text-emerald-700 font-mono mt-0.5">{formatCompact(compliance20Scenario)} RWF</p>
                  <p className="text-[9px] text-muted-foreground">+{formatCompact(compliance20Scenario - forecast.projectedNextMonth)} RWF above projection</p>
                </div>
                {pendingConfirmedGain > 0 && (
                  <div className="rounded-md border bg-blue-50/40 px-3 py-2 sm:col-span-2">
                    <p className="text-[10px] text-muted-foreground font-medium">If top 5 gap traders partially paid (40%)</p>
                    <p className="text-sm font-bold text-blue-700 font-mono mt-0.5">+{formatCompact(pendingConfirmedGain)} RWF</p>
                    <p className="text-[9px] text-muted-foreground">Immediate recovery from top outstanding merchants</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Confidence breakdown — collapsible */}
        <div className="rounded-lg border overflow-hidden">
          <button
            onClick={() => setShowConfidence(s => !s)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold">Confidence Breakdown</span>
              <Badge variant="secondary" className={`text-[9px] ${confidenceColor}`}>{confidence}% overall</Badge>
            </div>
            {showConfidence ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          {showConfidence && (
            <div className="border-t px-3 pb-3 pt-2.5 space-y-2.5">
              {[
                { label: "Data completeness", value: dataCompleteness, desc: `${forecast.monthlyData.filter(m => m.actual > 0).length} of ${forecast.monthlyData.length} months have actual data` },
                { label: "Historical consistency", value: historicalConsistency, desc: "How stable actual vs expected ratios are month-over-month" },
                { label: "Overall forecast confidence", value: confidence, desc: "Combined signal strength for next-month projection" },
              ].map(({ label, value, desc }) => (
                <div key={label} className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-medium">{label}</span>
                    <span className={`font-mono font-semibold ${value >= 70 ? "text-emerald-600" : value >= 40 ? "text-amber-600" : "text-red-600"}`}>{value}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/40">
                    <div
                      className={`h-full rounded-full transition-all ${value >= 70 ? "bg-emerald-500" : value >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${value}%` }}
                    />
                  </div>
                  <p className="text-[9px] text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top gap contributors */}
        {forecast.topGapContributors.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-red-500" />
              Top Outstanding Merchants — Immediate Action Required
            </p>
            {forecast.topGapContributors.slice(0, 5).map((c) => (
              <div key={c.merchantId} className="flex items-center justify-between text-xs rounded-lg border px-3 py-2">
                <span className="truncate max-w-[55%] font-medium">{c.merchantName}</span>
                <div className="text-right shrink-0">
                  <p className="font-mono text-red-600">-{formatCompact(c.gap)}</p>
                  <p className="text-[10px] text-muted-foreground">{c.gapPercentage}% unpaid</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
