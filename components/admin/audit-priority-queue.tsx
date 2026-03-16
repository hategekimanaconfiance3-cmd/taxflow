"use client";

import { useEffect, useState } from "react";
import type { RiskHeatmapData } from "@/lib/actions/risk-heatmap.action";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RiskScoreBadge } from "@/components/admin/risk-score-badge";
import { Loader2, Target } from "lucide-react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Audit Priority Queue — top traders by risk score for investigation
// ---------------------------------------------------------------------------

export function AuditPriorityQueue() {
    const [data, setData] = useState<RiskHeatmapData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Reuses the risk heatmap API which already returns top risk traders
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
                        Loading audit priorities…
                    </span>
                </CardContent>
            </Card>
        );
    }

    if (!data || data.topRiskTraders.length === 0) {
        return (
            <Card>
                <CardContent className="py-8 text-center">
                    <Target className="h-8 w-8 mx-auto text-emerald-500 mb-2" />
                    <p className="text-sm font-medium">No audit priorities</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        All traders within acceptable risk levels.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Audit Priority Queue
                    </CardTitle>
                    <span className="text-xs text-muted-foreground">
                        Top {data.topRiskTraders.length} by risk score
                    </span>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-1.5">
                    {data.topRiskTraders.map((trader, index) => (
                        <Link
                            key={trader.id}
                            href={`/admin/traders`}
                            className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-xs hover:bg-muted/50 transition-colors cursor-pointer"
                        >
                            <span className="text-muted-foreground font-mono w-5 text-right shrink-0">
                                #{index + 1}
                            </span>
                            <RiskScoreBadge
                                score={trader.score}
                                level={trader.level}
                            />
                            <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">
                                    {trader.name}
                                </p>
                                <p className="text-[10px] text-muted-foreground truncate">
                                    {trader.topReason}
                                </p>
                            </div>
                            <Badge
                                variant="secondary"
                                className={`text-[10px] shrink-0 ${
                                    trader.level === "critical" ? "bg-red-100 text-red-700" :
                                    trader.level === "high" ? "bg-orange-100 text-orange-700" :
                                    trader.level === "medium" ? "bg-amber-100 text-amber-700" :
                                    "bg-emerald-100 text-emerald-700"
                                }`}
                            >
                                {trader.level}
                            </Badge>
                        </Link>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
