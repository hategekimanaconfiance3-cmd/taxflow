"use client";

import { useEffect, useState } from "react";
import type { RiskHeatmapData } from "@/lib/actions/risk-heatmap.action";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Loader2, AlertTriangle } from "lucide-react";

// ---------------------------------------------------------------------------
// Compliance Risk Heatmap — trader risk tier distribution
// ---------------------------------------------------------------------------

const TIERS = [
    { key: "critical" as const, label: "Critical", color: "bg-red-500", textColor: "text-red-700", bgLight: "bg-red-50" },
    { key: "high" as const, label: "High", color: "bg-orange-500", textColor: "text-orange-700", bgLight: "bg-orange-50" },
    { key: "medium" as const, label: "Medium", color: "bg-amber-400", textColor: "text-amber-700", bgLight: "bg-amber-50" },
    { key: "low" as const, label: "Low", color: "bg-emerald-500", textColor: "text-emerald-700", bgLight: "bg-emerald-50" },
] as const;

export function ComplianceRiskHeatmap() {
    const [data, setData] = useState<RiskHeatmapData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/admin/risk-heatmap")
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
                        Computing risk distribution…
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
                        <Shield className="h-4 w-4" />
                        Compliance Risk Heatmap
                    </CardTitle>
                    <span className="text-xs text-muted-foreground">
                        {data.total} traders scored
                    </span>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Risk tier blocks */}
                <div className="grid grid-cols-4 gap-2">
                    {TIERS.map((tier) => {
                        const count = data[tier.key];
                        const pct = data.total > 0 ? Math.round((count / data.total) * 100) : 0;
                        return (
                            <div
                                key={tier.key}
                                className={`rounded-lg border p-3 text-center ${tier.bgLight}`}
                            >
                                <div className={`inline-flex h-3 w-3 rounded-full ${tier.color} mb-1.5`} />
                                <p className={`text-lg font-bold ${tier.textColor}`}>
                                    {count}
                                </p>
                                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                                    {tier.label}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                    {pct}%
                                </p>
                            </div>
                        );
                    })}
                </div>

                {/* Risk bar */}
                <div className="h-3 rounded-full overflow-hidden flex">
                    {TIERS.map((tier) => {
                        const pct = data.total > 0 ? (data[tier.key] / data.total) * 100 : 0;
                        if (pct === 0) return null;
                        return (
                            <div
                                key={tier.key}
                                className={`${tier.color} transition-all`}
                                style={{ width: `${pct}%` }}
                                title={`${tier.label}: ${data[tier.key]}`}
                            />
                        );
                    })}
                </div>

                {/* Top risk traders */}
                {data.topRiskTraders.length > 0 && (
                    <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Top Risk Traders
                        </p>
                        {data.topRiskTraders.slice(0, 5).map((t) => (
                            <div
                                key={t.id}
                                className="flex items-center justify-between text-xs py-1.5 px-2 rounded border"
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <Badge
                                        variant="secondary"
                                        className={`text-[10px] px-1.5 ${
                                            t.level === "critical" ? "bg-red-100 text-red-700" :
                                            t.level === "high" ? "bg-orange-100 text-orange-700" :
                                            t.level === "medium" ? "bg-amber-100 text-amber-700" :
                                            "bg-emerald-100 text-emerald-700"
                                        }`}
                                    >
                                        {t.score}
                                    </Badge>
                                    <span className="font-medium truncate">{t.name}</span>
                                </div>
                                <span className="text-muted-foreground text-[10px] shrink-0 ml-2">
                                    {t.topReason}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
