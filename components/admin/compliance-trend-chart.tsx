"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, TrendingDown, Minus, Target } from "lucide-react";

// ---------------------------------------------------------------------------
// Compliance Trend Chart — monthly collection rate over time
// Target line at 80%, insight summary, period comparison
// ---------------------------------------------------------------------------

const COMPLIANCE_TARGET = 80; // RRA standard target %

interface MonthlyCompliance {
    month: string;
    rate: number;
    expected: number;
    collected: number;
}

function formatMonth(ym: string): string {
    const [, month] = ym.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months[parseInt(month) - 1] ?? ym;
}

function computeInsight(data: MonthlyCompliance[]): string {
    if (data.length === 0) return "";
    const lastRate = data[data.length - 1]?.rate ?? 0;
    const prevRate = data[data.length - 2]?.rate ?? lastRate;
    const change = lastRate - prevRate;
    const belowTarget = data.filter((d) => d.rate < COMPLIANCE_TARGET).length;

    if (lastRate >= COMPLIANCE_TARGET && change >= 0) {
        return `On target. Rate is ${lastRate}% — ${change > 0 ? `+${change}pp vs prior period` : "stable"}.`;
    }
    if (lastRate >= COMPLIANCE_TARGET && change < 0) {
        return `On target but declining. Rate dropped ${Math.abs(change)}pp to ${lastRate}% — monitor closely.`;
    }
    if (belowTarget === data.length) {
        return `Persistently below ${COMPLIANCE_TARGET}% target across all ${data.length} periods. Escalation warranted.`;
    }
    return `Below target at ${lastRate}%. ${belowTarget} of ${data.length} periods missed the ${COMPLIANCE_TARGET}% threshold.`;
}

export function ComplianceTrendChart() {
    const [data, setData] = useState<MonthlyCompliance[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/ai/forecast?months=6")
            .then((r) => (r.ok ? r.json() : null))
            .then((forecast) => {
                if (forecast?.monthlyData) {
                    const trends: MonthlyCompliance[] = forecast.monthlyData.map(
                        (m: { month: string; expected: number; actual: number }) => ({
                            month: formatMonth(m.month),
                            rate: m.expected > 0 ? Math.min(100, Math.round((m.actual / m.expected) * 100)) : 0,
                            expected: m.expected,
                            collected: m.actual,
                        }),
                    );
                    setData(trends);
                }
            })
            .catch(() => setData([]))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">
                        Loading compliance trends…
                    </span>
                </CardContent>
            </Card>
        );
    }

    if (data.length === 0) return null;

    const maxRate = Math.max(...data.map((d) => d.rate), COMPLIANCE_TARGET, 100);

    const firstRate = data[0]?.rate ?? 0;
    const lastRate = data[data.length - 1]?.rate ?? 0;
    const prevRate = data[data.length - 2]?.rate ?? lastRate;
    const trendDiff = lastRate - firstRate;
    const periodDiff = lastRate - prevRate;
    const trendDirection = trendDiff > 0 ? "improving" : trendDiff < 0 ? "declining" : "stable";
    const onTarget = lastRate >= COMPLIANCE_TARGET;

    const targetBarPct = (COMPLIANCE_TARGET / maxRate) * 100;
    const insight = computeInsight(data);

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Compliance Trend
                    </CardTitle>
                    <div className={`flex items-center gap-1 text-xs font-medium ${
                        trendDirection === "improving" ? "text-emerald-600" :
                        trendDirection === "declining" ? "text-red-600" :
                        "text-muted-foreground"
                    }`}>
                        {trendDirection === "improving"
                            ? <TrendingUp className="h-3 w-3" />
                            : trendDirection === "declining"
                            ? <TrendingDown className="h-3 w-3" />
                            : <Minus className="h-3 w-3" />}
                        {Math.abs(trendDiff)}pp overall
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {/* Bar chart with target line */}
                <div className="relative">
                    {/* Target line */}
                    <div
                        className="absolute left-0 right-0 border-t-2 border-dashed border-amber-400/70 z-10 flex items-center"
                        style={{ bottom: `${targetBarPct}%`, marginBottom: "1.5rem" }}
                    >
                        <span className="absolute right-0 text-[8px] font-semibold text-amber-600 bg-background px-0.5 -translate-y-2">
                            {COMPLIANCE_TARGET}% target
                        </span>
                    </div>

                    <div className="flex items-end gap-1 h-28 pb-0">
                        {data.map((d, i) => (
                            <div
                                key={i}
                                className="flex-1 flex flex-col items-center gap-1"
                            >
                                <span className="text-[9px] font-mono font-semibold">
                                    {d.rate}%
                                </span>
                                <div className="w-full relative">
                                    <div
                                        className={`w-full rounded-t transition-all ${
                                            d.rate >= COMPLIANCE_TARGET ? "bg-emerald-500" :
                                            d.rate >= 60 ? "bg-amber-500" :
                                            "bg-red-500"
                                        }`}
                                        style={{
                                            height: `${Math.max(4, (d.rate / maxRate) * 80)}px`,
                                        }}
                                    />
                                </div>
                                <span className="text-[8px] text-muted-foreground">
                                    {d.month}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Target legend */}
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <span className="w-3 h-0.5 bg-emerald-500 inline-block" /> ≥{COMPLIANCE_TARGET}%
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-3 h-0.5 bg-amber-500 inline-block" /> 60–{COMPLIANCE_TARGET - 1}%
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-3 h-0.5 bg-red-500 inline-block" /> &lt;60%
                    </span>
                    <span className="flex items-center gap-1 ml-auto">
                        <Target className="h-2.5 w-2.5 text-amber-500" />
                        <span>RRA target: {COMPLIANCE_TARGET}%</span>
                    </span>
                </div>

                {/* Current rate + period comparison */}
                <div className="rounded-lg border p-3 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-medium">Current Rate</p>
                        <p className="text-[10px] text-muted-foreground">
                            {periodDiff !== 0
                                ? `${periodDiff > 0 ? "+" : ""}${periodDiff}pp vs prior period`
                                : "No change vs prior period"}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {onTarget ? (
                            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-[9px]">
                                On target
                            </Badge>
                        ) : (
                            <Badge variant="secondary" className="bg-red-100 text-red-700 text-[9px]">
                                Below target
                            </Badge>
                        )}
                        <p className={`text-xl font-bold ${
                            lastRate >= COMPLIANCE_TARGET ? "text-emerald-600" :
                            lastRate >= 60 ? "text-amber-600" :
                            "text-red-600"
                        }`}>
                            {lastRate}%
                        </p>
                    </div>
                </div>

                {/* Insight summary */}
                {insight && (
                    <p className="text-[11px] text-muted-foreground leading-snug border-t pt-2">
                        {insight}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
