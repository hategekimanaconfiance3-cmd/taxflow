"use client";

import { useEffect, useState } from "react";
import type { RevenueForecast } from "@/lib/ai/revenue-forecast";
import { formatCompact } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    TrendingUp,
    TrendingDown,
    Minus,
    Brain,
    Loader2,
    AlertTriangle,
    Gauge,
    Lightbulb,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Revenue Forecast Chart — Expected vs Actual tax revenue visualization
// ---------------------------------------------------------------------------

export function RevenueForecastChart() {
    const [forecast, setForecast] = useState<RevenueForecast | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/ai/forecast?months=6")
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => setForecast(data))
            .catch(() => setForecast(null))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">
                        AI computing forecast…
                    </span>
                </CardContent>
            </Card>
        );
    }

    if (!forecast) return null;

    const maxValue = Math.max(
        ...forecast.monthlyData.map((m) => Math.max(m.expected, m.actual)),
        1,
    );

    const TrendIcon =
        forecast.trend === "growing" ? TrendingUp :
        forecast.trend === "declining" ? TrendingDown : Minus;

    const trendColor =
        forecast.trend === "growing" ? "text-emerald-600" :
        forecast.trend === "declining" ? "text-red-600" : "text-muted-foreground";

    const confidenceColor =
        (forecast.confidence ?? 0) >= 70 ? "bg-emerald-100 text-emerald-700" :
        (forecast.confidence ?? 0) >= 40 ? "bg-amber-100 text-amber-700" :
        "bg-red-100 text-red-700";

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Brain className="h-4 w-4" />
                        AI Revenue Forecast
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        {/* Confidence badge */}
                        {forecast.confidence != null && (
                            <Badge variant="secondary" className={`text-[10px] ${confidenceColor}`}>
                                <Gauge className="h-2.5 w-2.5 mr-0.5" />
                                {forecast.confidence}% confidence
                            </Badge>
                        )}
                        <div className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
                            <TrendIcon className="h-3.5 w-3.5" />
                            {forecast.trend === "growing" ? "Growing" :
                             forecast.trend === "declining" ? "Declining" : "Stable"}
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border p-3 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                            Expected
                        </p>
                        <p className="text-sm font-bold font-mono mt-1">
                            {formatCompact(forecast.expectedRevenue)}
                        </p>
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                            Collected
                        </p>
                        <p className="text-sm font-bold font-mono text-emerald-600 mt-1">
                            {formatCompact(forecast.actualRevenue)}
                        </p>
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                            Gap
                        </p>
                        <p className={`text-sm font-bold font-mono mt-1 ${
                            forecast.gap > 0 ? "text-red-600" : "text-emerald-600"
                        }`}>
                            {forecast.gap > 0 ? "-" : "+"}{formatCompact(Math.abs(forecast.gap))}
                            <span className="text-[10px] ml-0.5">({forecast.gapPercentage}%)</span>
                        </p>
                    </div>
                </div>

                {/* Gap Analysis — causes */}
                {forecast.gapCauses && forecast.gapCauses.length > 0 && forecast.gap > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-1.5">
                        <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                            <Lightbulb className="h-3.5 w-3.5" />
                            Gap Analysis
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

                {/* Bar chart */}
                <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Monthly Breakdown</p>
                    <div className="space-y-3">
                        {forecast.monthlyData.map((m) => {
                            const expectedPct = (m.expected / maxValue) * 100;
                            const actualPct = (m.actual / maxValue) * 100;
                            return (
                                <div key={m.month} className="space-y-1">
                                    <div className="flex items-center justify-between text-[10px]">
                                        <span className="font-medium">{formatMonth(m.month)}</span>
                                        <span className="text-muted-foreground">
                                            {m.traderCount} traders
                                        </span>
                                    </div>
                                    {/* Expected bar */}
                                    <div className="relative h-2 rounded-full bg-muted/30">
                                        <div
                                            className="absolute inset-y-0 left-0 rounded-full bg-blue-300/60 dark:bg-blue-500/30"
                                            style={{ width: `${expectedPct}%` }}
                                        />
                                        <div
                                            className="absolute inset-y-0 left-0 rounded-full bg-emerald-500/70"
                                            style={{ width: `${actualPct}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
                                        <span>
                                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" />
                                            {formatCompact(m.actual)}
                                        </span>
                                        <span>
                                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-300 mr-1" />
                                            {formatCompact(m.expected)}
                                        </span>
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
                        <p className="text-[10px] text-muted-foreground">Linear regression estimate</p>
                    </div>
                    <p className="text-sm font-bold font-mono">
                        {formatCompact(forecast.projectedNextMonth)}
                    </p>
                </div>

                {/* Top gap contributors */}
                {forecast.topGapContributors.length > 0 && (
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Top Outstanding Merchants
                        </p>
                        <div className="space-y-1">
                            {forecast.topGapContributors.slice(0, 5).map((c) => (
                                <div
                                    key={c.merchantId}
                                    className="flex items-center justify-between text-xs py-1 border-b last:border-0"
                                >
                                    <span className="truncate max-w-[60%]">{c.merchantName}</span>
                                    <span className="font-mono text-red-600">
                                        -{formatCompact(c.gap)} ({c.gapPercentage}%)
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function formatMonth(ym: string): string {
    const [year, month] = ym.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[parseInt(month) - 1]} ${year}`;
}
