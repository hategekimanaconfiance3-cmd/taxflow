"use client";

import { useEffect, useState } from "react";
import type { RiskHeatmapData } from "@/lib/actions/risk-heatmap.action";
import type { SmartAlertsData } from "@/lib/actions/smart-alerts.action";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RiskScoreBadge } from "@/components/admin/risk-score-badge";
import { Loader2, Target, AlertTriangle } from "lucide-react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Audit Priority Queue — combines risk scoring + smart alerts for
// a unified audit priority list (Issue #8 fix)
// ---------------------------------------------------------------------------

interface AuditTrader {
    id: string;
    name: string;
    score: number;
    level: "critical" | "high" | "medium" | "low";
    topReason: string;
    hasAlerts: boolean;
}

export function AuditPriorityQueue() {
    const [riskData, setRiskData] = useState<RiskHeatmapData | null>(null);
    const [alertData, setAlertData] = useState<SmartAlertsData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Fetch both risk heatmap and smart alerts
        Promise.all([
            fetch("/api/admin/risk-heatmap").then((r) => (r.ok ? r.json() : null)),
            fetch("/api/admin/smart-alerts").then((r) => (r.ok ? r.json() : null)),
        ])
            .then(([risk, alerts]) => {
                setRiskData(risk);
                setAlertData(alerts);
            })
            .catch(() => {
                setRiskData(null);
                setAlertData(null);
            })
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

    // Build unified priority list from risk traders + alert-flagged traders
    const priorityTraders = buildPriorityList(riskData, alertData);

    if (priorityTraders.length === 0) {
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

    const flaggedCount = priorityTraders.filter((t) => t.level === "critical" || t.level === "high" || t.hasAlerts).length;

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Audit Priority Queue
                    </CardTitle>
                    <div className="flex items-center gap-1.5">
                        {flaggedCount > 0 && (
                            <Badge variant="secondary" className="bg-red-100 text-red-700 text-[10px]">
                                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                                {flaggedCount} traders flagged
                            </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                            Top {priorityTraders.length} by risk
                        </span>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-1.5">
                    {priorityTraders.map((trader, index) => (
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
                            <div className="flex items-center gap-1.5 shrink-0">
                                {trader.hasAlerts && (
                                    <Badge variant="secondary" className="text-[9px] bg-amber-100 text-amber-700">
                                        alert
                                    </Badge>
                                )}
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
                            </div>
                        </Link>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

/**
 * Merge risk heatmap traders with smart alert flagged traders
 * to create a unified audit priority list.
 */
function buildPriorityList(
    riskData: RiskHeatmapData | null,
    alertData: SmartAlertsData | null,
): AuditTrader[] {
    const traderMap = new Map<string, AuditTrader>();

    // Add risk-scored traders (medium+ only for audit queue)
    if (riskData?.topRiskTraders) {
        for (const t of riskData.topRiskTraders) {
            traderMap.set(t.id, {
                id: t.id,
                name: t.name,
                score: t.score,
                level: t.level,
                topReason: t.topReason,
                hasAlerts: false,
            });
        }
    }

    // Merge in alert-flagged traders — boost their priority if they
    // already exist, or add them if they don't
    if (alertData?.alerts) {
        for (const alert of alertData.alerts) {
            if (alert.severity === "info") continue; // skip info-level
            const existing = traderMap.get(alert.traderId);
            if (existing) {
                existing.hasAlerts = true;
                // Boost score for traders with alerts
                if (alert.severity === "critical" && existing.level !== "critical") {
                    existing.score = Math.min(100, existing.score + 20);
                    existing.level = existing.score >= 75 ? "critical" : existing.score >= 50 ? "high" : existing.level;
                }
            } else {
                // Add trader from alerts even if not in top risk
                const alertScore = alert.severity === "critical" ? 70 : 40;
                traderMap.set(alert.traderId, {
                    id: alert.traderId,
                    name: alert.traderName,
                    score: alertScore,
                    level: alertScore >= 75 ? "critical" : alertScore >= 50 ? "high" : "medium",
                    topReason: alert.title,
                    hasAlerts: true,
                });
            }
        }
    }

    return Array.from(traderMap.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
}
