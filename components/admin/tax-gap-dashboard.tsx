"use client";

import { useEffect, useState } from "react";
import type { TaxGapData } from "@/lib/actions/tax-gap.action";
import { formatCompact } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, PieChart, AlertTriangle } from "lucide-react";

// ---------------------------------------------------------------------------
// Tax Gap Dashboard — VAT gap breakdown by sector and trader
// ---------------------------------------------------------------------------

export function TaxGapDashboard() {
    const [data, setData] = useState<TaxGapData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/admin/tax-gap")
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
                    <span className="ml-2 text-sm text-muted-foreground">
                        Computing tax gaps…
                    </span>
                </CardContent>
            </Card>
        );
    }

    if (!data) return null;

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <PieChart className="h-4 w-4" />
                        National Tax Gap
                    </CardTitle>
                    <Badge
                        variant="secondary"
                        className={`text-xs ${
                            data.gapPercentage > 30 ? "bg-red-100 text-red-700" :
                            data.gapPercentage > 15 ? "bg-amber-100 text-amber-700" :
                            "bg-emerald-100 text-emerald-700"
                        }`}
                    >
                        {data.gapPercentage}% gap
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Summary row */}
                <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg border p-2.5 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Expected</p>
                        <p className="text-sm font-bold font-mono mt-0.5">
                            {formatCompact(data.totalExpected)}
                        </p>
                    </div>
                    <div className="rounded-lg border p-2.5 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Collected</p>
                        <p className="text-sm font-bold font-mono text-emerald-600 mt-0.5">
                            {formatCompact(data.totalCollected)}
                        </p>
                    </div>
                    <div className="rounded-lg border p-2.5 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gap</p>
                        <p className="text-sm font-bold font-mono text-red-600 mt-0.5">
                            {formatCompact(data.totalGap)}
                        </p>
                    </div>
                </div>

                {/* Sector breakdown */}
                {data.bySector.length > 0 && (
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Sector Breakdown</p>
                        <div className="space-y-2">
                            {data.bySector.map((sector) => {
                                const collectionPct = sector.expected > 0
                                    ? Math.min(100, Math.round((sector.collected / sector.expected) * 100))
                                    : 0;
                                return (
                                    <div key={sector.sector} className="space-y-1">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="font-medium">
                                                {sector.sector}
                                                <span className="text-muted-foreground ml-1">
                                                    ({sector.traderCount})
                                                </span>
                                            </span>
                                            <span className="font-mono text-red-600">
                                                {formatCompact(sector.gap)} gap
                                            </span>
                                        </div>
                                        <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${
                                                    collectionPct >= 80 ? "bg-emerald-500" :
                                                    collectionPct >= 50 ? "bg-amber-500" :
                                                    "bg-red-500"
                                                }`}
                                                style={{ width: `${collectionPct}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
                                            <span>Collected: {formatCompact(sector.collected)}</span>
                                            <span>Expected: {formatCompact(sector.expected)}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Top trader gaps */}
                {data.topTraderGaps.length > 0 && (
                    <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Top Tax Gap Traders
                        </p>
                        {data.topTraderGaps.slice(0, 5).map((t) => (
                            <div
                                key={t.id}
                                className="flex items-center justify-between text-xs py-1.5 px-2 rounded border"
                            >
                                <div className="min-w-0">
                                    <span className="font-medium truncate block">{t.name}</span>
                                    <span className="text-[10px] text-muted-foreground capitalize">{t.role}</span>
                                </div>
                                <div className="text-right shrink-0 ml-2">
                                    <span className="font-mono text-red-600 block">
                                        {formatCompact(t.gap)}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                        {t.gapPercentage}% unpaid
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
