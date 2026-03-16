"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp } from "lucide-react";

// ---------------------------------------------------------------------------
// Compliance Trend Chart — monthly collection rate over time
// ---------------------------------------------------------------------------

interface MonthlyCompliance {
    month: string;
    rate: number;
    expected: number;
    collected: number;
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

    const maxRate = Math.max(...data.map((d) => d.rate), 100);

    // Calculate trend direction
    const firstRate = data[0]?.rate ?? 0;
    const lastRate = data[data.length - 1]?.rate ?? 0;
    const trendDirection = lastRate > firstRate ? "improving" : lastRate < firstRate ? "declining" : "stable";
    const trendDiff = lastRate - firstRate;

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
                        {trendDirection === "improving" ? "▲" : trendDirection === "declining" ? "▼" : "—"}{" "}
                        {Math.abs(trendDiff)}% {trendDirection}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {/* Line chart using CSS bars */}
                <div className="flex items-end gap-1 h-28">
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
                                        d.rate >= 80 ? "bg-emerald-500" :
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

                {/* Current rate highlight */}
                <div className="rounded-lg border p-3 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-medium">Current Collection Rate</p>
                        <p className="text-[10px] text-muted-foreground">
                            Latest period
                        </p>
                    </div>
                    <p className={`text-xl font-bold ${
                        lastRate >= 80 ? "text-emerald-600" :
                        lastRate >= 60 ? "text-amber-600" :
                        "text-red-600"
                    }`}>
                        {lastRate}%
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}

function formatMonth(ym: string): string {
    const [, month] = ym.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months[parseInt(month) - 1] ?? ym;
}
