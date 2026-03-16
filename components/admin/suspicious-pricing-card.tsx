"use client";

import { useEffect, useState } from "react";
import type { SuspiciousTransactionsData } from "@/lib/actions/suspicious-transactions.action";
import { formatCompact } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, TrendingDown, Copy, DollarSign } from "lucide-react";

// ---------------------------------------------------------------------------
// Suspicious Pricing Detection Card
// ---------------------------------------------------------------------------

export function SuspiciousPricingCard() {
    const [data, setData] = useState<SuspiciousTransactionsData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/admin/suspicious-transactions")
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
                        Scanning for suspicious pricing…
                    </span>
                </CardContent>
            </Card>
        );
    }

    if (!data) return null;

    const CATEGORIES = [
        {
            icon: <TrendingDown className="h-3.5 w-3.5" />,
            label: "Below market price",
            count: data.belowMarketPrice,
            color: "text-amber-600",
            bgColor: "bg-amber-50",
        },
        {
            icon: <AlertTriangle className="h-3.5 w-3.5" />,
            label: "Extreme price drops",
            count: data.extremePriceDrops,
            color: "text-red-600",
            bgColor: "bg-red-50",
        },
        {
            icon: <Copy className="h-3.5 w-3.5" />,
            label: "Duplicate entries",
            count: data.duplicateEntries,
            color: "text-blue-600",
            bgColor: "bg-blue-50",
        },
    ];

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        Suspicious Pricing Detection
                    </CardTitle>
                    {data.totalSuspicious > 0 && (
                        <Badge
                            variant="secondary"
                            className="bg-red-100 text-red-700 text-xs"
                        >
                            {data.totalSuspicious} flagged
                        </Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {/* Category counts */}
                <div className="space-y-2">
                    {CATEGORIES.map((cat) => (
                        <div
                            key={cat.label}
                            className={`flex items-center justify-between text-sm py-2 px-3 rounded-lg ${cat.bgColor}`}
                        >
                            <span className={`flex items-center gap-2 ${cat.color}`}>
                                {cat.icon}
                                <span className="text-xs font-medium">{cat.label}</span>
                            </span>
                            <span className={`font-bold ${cat.color}`}>
                                {cat.count}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Recent flagged transactions */}
                {data.recentFlags.length > 0 && (
                    <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">
                            Recent Flags (last 7 days)
                        </p>
                        {data.recentFlags.slice(0, 5).map((flag) => (
                            <div
                                key={flag.transactionId}
                                className="flex items-center justify-between text-xs py-1.5 px-2 rounded border"
                            >
                                <div className="min-w-0">
                                    <p className="font-medium truncate">{flag.sellerName}</p>
                                    <p className="text-[10px] text-muted-foreground">
                                        {flag.productName} · {flag.type.replace(/_/g, " ")}
                                    </p>
                                </div>
                                <div className="text-right shrink-0 ml-2">
                                    <p className="font-mono text-red-600">
                                        {formatCompact(flag.unitPrice)}
                                    </p>
                                    {flag.marketMedian > 0 && (
                                        <p className="text-[10px] text-muted-foreground">
                                            median: {formatCompact(flag.marketMedian)}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {data.totalSuspicious === 0 && (
                    <div className="text-center py-3">
                        <p className="text-sm text-emerald-600 font-medium">✓ No suspicious pricing detected</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Last 7 days scanned</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
