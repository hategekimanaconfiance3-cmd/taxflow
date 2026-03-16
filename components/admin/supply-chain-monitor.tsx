"use client";

import { useEffect, useState } from "react";
import type { SupplyChainData } from "@/lib/actions/supply-chain-stats.action";
import { formatCompact } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Network, Package, ArrowRight, Clock } from "lucide-react";

// ---------------------------------------------------------------------------
// Supply Chain Monitor — product flow visualization
// ---------------------------------------------------------------------------

export function SupplyChainMonitor() {
    const [data, setData] = useState<SupplyChainData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/admin/supply-chain")
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
                        Loading supply chain data…
                    </span>
                </CardContent>
            </Card>
        );
    }

    if (!data) return null;

    const STAT_ITEMS = [
        { label: "Products in Circulation", value: data.productsInCirculation, icon: <Package className="h-3.5 w-3.5 text-violet-500" /> },
        { label: "Stock Movement Today", value: data.totalStockMovementToday, icon: <ArrowRight className="h-3.5 w-3.5 text-blue-500" /> },
        { label: "Pending Confirmations", value: data.pendingConfirmations, icon: <Clock className="h-3.5 w-3.5 text-amber-500" /> },
    ];

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Network className="h-4 w-4" />
                    Supply Chain Monitor
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Key stats */}
                <div className="grid grid-cols-3 gap-2">
                    {STAT_ITEMS.map((item) => (
                        <div key={item.label} className="rounded-lg border p-2.5 text-center">
                            <div className="flex justify-center mb-1">{item.icon}</div>
                            <p className="text-lg font-bold">{item.value}</p>
                            <p className="text-[9px] text-muted-foreground">{item.label}</p>
                        </div>
                    ))}
                </div>

                {/* Flow Summary */}
                {data.flowSummary.length > 0 && (
                    <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">
                            Product Flow (Last 7 Days)
                        </p>
                        {data.flowSummary.map((flow) => (
                            <div
                                key={flow.label}
                                className="flex items-center justify-between text-xs py-1.5 px-2 rounded border"
                            >
                                <span className="font-medium">{flow.label}</span>
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="text-[10px]">
                                        {flow.count} txns
                                    </Badge>
                                    <span className="font-mono text-muted-foreground">
                                        {formatCompact(flow.value)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Top products */}
                {data.topProducts.length > 0 && (
                    <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">
                            Top Products
                        </p>
                        {data.topProducts.map((p) => (
                            <div
                                key={p.name}
                                className="flex items-center justify-between text-xs py-1 px-2 rounded border"
                            >
                                <span className="font-medium truncate">{p.name}</span>
                                <div className="text-right shrink-0 ml-2">
                                    <span className="font-mono">{formatCompact(p.totalValue)}</span>
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                        ({p.txnCount} txns)
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
