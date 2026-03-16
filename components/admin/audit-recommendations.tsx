"use client";

import { useEffect, useState } from "react";
import type { AuditPlan } from "@/lib/ai/smart-audit";
import { formatCompact } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RiskScoreBadge } from "@/components/admin/risk-score-badge";
import {
    Brain,
    Loader2,
    MapPin,
    Target,
    TrendingUp,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Audit Recommendations — AI-driven audit selection with geo clustering
// ---------------------------------------------------------------------------

export function AuditRecommendations() {
    const [plan, setPlan] = useState<AuditPlan | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/ai/audit-recommendations?limit=15")
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => setPlan(data))
            .catch(() => setPlan(null))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">
                        AI selecting audit targets…
                    </span>
                </CardContent>
            </Card>
        );
    }

    if (!plan || plan.clusters.length === 0) {
        return (
            <Card>
                <CardContent className="py-8 text-center">
                    <Target className="h-8 w-8 mx-auto text-emerald-500 mb-2" />
                    <p className="text-sm font-medium">No audits recommended</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        All merchants are within acceptable risk parameters.
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
                        <Brain className="h-4 w-4" />
                        AI Audit Recommendations
                    </CardTitle>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <Target className="h-3 w-3" />
                            {plan.totalMerchants} targets
                        </span>
                        <span className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            {formatCompact(plan.totalEstimatedRecovery)} est. recovery
                        </span>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {plan.clusters.map((cluster) => (
                    <div key={cluster.district} className="space-y-2">
                        {/* District header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs font-medium">
                                <MapPin className="h-3 w-3 text-violet-500" />
                                <span>{cluster.district}</span>
                                <span className="text-muted-foreground">
                                    · {cluster.merchantCount} merchant{cluster.merchantCount !== 1 ? "s" : ""}
                                </span>
                            </div>
                            {cluster.totalEstimatedGap > 0 && (
                                <span className="text-[10px] font-mono text-red-600">
                                    {formatCompact(cluster.totalEstimatedGap)} gap
                                </span>
                            )}
                        </div>

                        {/* Merchant rows */}
                        <div className="space-y-1">
                            {cluster.merchants.map((m) => (
                                <a
                                    key={m.merchantId}
                                    href="/admin/traders"
                                    className="flex items-center gap-3 rounded-lg border px-3 py-2 text-xs hover:bg-muted/50 transition-colors cursor-pointer"
                                >
                                    <RiskScoreBadge
                                        score={m.riskScore}
                                        level={m.riskLevel}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate">
                                            {m.merchantName ?? "Unknown"}
                                        </p>
                                        {m.reasons.length > 0 && (
                                            <p className="text-[10px] text-muted-foreground truncate">
                                                {m.reasons[0]}
                                            </p>
                                        )}
                                    </div>
                                    <div className="text-right shrink-0">
                                        {m.tinNumber && (
                                            <p className="font-mono text-muted-foreground">
                                                {m.tinNumber}
                                            </p>
                                        )}
                                        {m.estimatedTaxGap > 0 && (
                                            <p className="text-[10px] font-mono text-red-600">
                                                -{formatCompact(m.estimatedTaxGap)}
                                            </p>
                                        )}
                                    </div>
                                </a>
                            ))}
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}


