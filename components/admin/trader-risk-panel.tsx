"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RiskScoreBadge } from "@/components/admin/risk-score-badge";
import { Shield, AlertTriangle, TrendingDown, Clock, BarChart2, Activity } from "lucide-react";
import { ListCardSkeleton } from "@/components/admin/loading-skeletons";

// ---------------------------------------------------------------------------
// Trader Risk Panel — detailed 5-signal risk breakdown
// ---------------------------------------------------------------------------

interface RiskSignal {
    name: string;
    score: number;
    maxScore: number;
    icon: React.ReactNode;
    description: string;
}

interface TraderRiskData {
    merchantName: string;
    merchantId: string;
    totalScore: number;
    riskLevel: "critical" | "high" | "medium" | "low";
    signals: RiskSignal[];
}

export function TraderRiskPanel() {
    const [data, setData] = useState<TraderRiskData[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/ai/risk-score?limit=5&detailed=true")
            .then((r) => (r.ok ? r.json() : null))
            .then((result) => {
                if (result?.merchants) {
                    setData(
                        result.merchants.map((m: Record<string, unknown>) => ({
                            merchantName: m.merchantName ?? "Unknown",
                            merchantId: m.merchantId ?? "",
                            totalScore: m.totalScore ?? 0,
                            riskLevel: m.riskLevel ?? "low",
                            signals: [
                                {
                                    name: "Tax Compliance",
                                    score: (m.taxComplianceScore as number) ?? 0,
                                    maxScore: 30,
                                    icon: <Shield className="h-3 w-3" />,
                                    description: "Payment-to-obligation ratio",
                                },
                                {
                                    name: "Price Deviation",
                                    score: (m.priceDeviationScore as number) ?? 0,
                                    maxScore: 25,
                                    icon: <TrendingDown className="h-3 w-3" />,
                                    description: "Deviation from market median",
                                },
                                {
                                    name: "Transaction Pattern",
                                    score: (m.transactionPatternScore as number) ?? 0,
                                    maxScore: 20,
                                    icon: <Activity className="h-3 w-3" />,
                                    description: "Unusual activity patterns",
                                },
                                {
                                    name: "Filing History",
                                    score: (m.filingHistoryScore as number) ?? 0,
                                    maxScore: 15,
                                    icon: <Clock className="h-3 w-3" />,
                                    description: "Late filing frequency",
                                },
                                {
                                    name: "Audit Flags",
                                    score: (m.auditFlagScore as number) ?? 0,
                                    maxScore: 10,
                                    icon: <AlertTriangle className="h-3 w-3" />,
                                    description: "Historical compliance flags",
                                },
                            ],
                        })),
                    );
                }
            })
            .catch(() => setData([]))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return <ListCardSkeleton rows={6} />;
    }

    if (data.length === 0) return null;

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <BarChart2 className="h-4 w-4" />
                    Trader Risk Breakdown
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {data.map((trader) => (
                    <div key={trader.merchantId} className="space-y-2 rounded-lg border p-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <RiskScoreBadge score={trader.totalScore} level={trader.riskLevel} />
                                <span className="text-sm font-medium">{trader.merchantName}</span>
                            </div>
                            <Badge
                                variant="secondary"
                                className={`text-[10px] ${
                                    trader.riskLevel === "critical" ? "bg-red-100 text-red-700" :
                                    trader.riskLevel === "high" ? "bg-orange-100 text-orange-700" :
                                    trader.riskLevel === "medium" ? "bg-amber-100 text-amber-700" :
                                    "bg-emerald-100 text-emerald-700"
                                }`}
                            >
                                {trader.riskLevel}
                            </Badge>
                        </div>
                        {/* Signal bars */}
                        <div className="space-y-1.5">
                            {trader.signals.map((signal) => (
                                <div key={signal.name} className="flex items-center gap-2 text-xs">
                                    <div className="shrink-0 text-muted-foreground w-3">{signal.icon}</div>
                                    <span className="w-28 shrink-0 text-muted-foreground">{signal.name}</span>
                                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${
                                                signal.score / signal.maxScore >= 0.7 ? "bg-red-500" :
                                                signal.score / signal.maxScore >= 0.4 ? "bg-amber-500" :
                                                "bg-emerald-500"
                                            }`}
                                            style={{ width: `${Math.min(100, (signal.score / signal.maxScore) * 100)}%` }}
                                        />
                                    </div>
                                    <span className="font-mono text-[10px] w-8 text-right">
                                        {signal.score}/{signal.maxScore}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}
