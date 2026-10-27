"use client";

import { useEffect, useState } from "react";
import type { EconomicStatsData } from "@/lib/actions/economic-stats.action";
import { formatCompact } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Globe, TrendingUp, TrendingDown, Package, BarChart2, Inbox } from "lucide-react";

// ---------------------------------------------------------------------------
// Economic Intelligence — national overview
// ---------------------------------------------------------------------------

export function EconomicIntelligence() {
    const [data, setData] = useState<EconomicStatsData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/admin/economic-stats")
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
                        Loading economic intelligence…
                    </span>
                </CardContent>
            </Card>
        );
    }

    if (!data) return null;

    // Check if all data sections are empty / zero
    const hasNoData =
        data.sectorActivity.length === 0 &&
        data.topProducts.length === 0 &&
        data.priceChanges.length === 0 &&
        data.stockOverview.totalProducts === 0 &&
        data.stockOverview.totalQuantity === 0;

    if (hasNoData) {
        return (
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        National Economic Intelligence
                    </CardTitle>
                </CardHeader>
                <CardContent className="py-8 text-center">
                    <Inbox className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm font-medium text-muted-foreground">
                        No data available for selected period
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                        Economic intelligence will populate as trading activity increases.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    National Economic Intelligence
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
                {/* Sector Activity */}
                {data.sectorActivity.length > 0 && (
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                            <BarChart2 className="h-3 w-3" />
                            Sector Activity (Last 30 Days)
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {data.sectorActivity.map((sector) => (
                                <div key={sector.role} className="rounded-lg border p-3 space-y-1.5">
                                    <p className="text-xs font-semibold">{sector.label}</p>
                                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                                        <span className="text-muted-foreground">Traders</span>
                                        <span className="font-mono text-right">{sector.traderCount}</span>
                                        <span className="text-muted-foreground">Transactions</span>
                                        <span className="font-mono text-right">{sector.transactionCount}</span>
                                        <span className="text-muted-foreground">Volume</span>
                                        <span className="font-mono text-right">{formatCompact(sector.totalValue)}</span>
                                        <span className="text-muted-foreground">VAT Generated</span>
                                        <span className="font-mono text-right text-emerald-600">{formatCompact(sector.vatGenerated)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Top Products */}
                {data.topProducts.length > 0 && (
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                            <Package className="h-3 w-3" />
                            Top Products by Volume
                        </p>
                        <div className="space-y-1">
                            {data.topProducts.slice(0, 5).map((p, i) => (
                                <div key={p.name} className="flex items-center justify-between text-xs py-1.5 px-2 rounded border">
                                    <span className="flex items-center gap-2">
                                        <span className="text-muted-foreground font-mono w-4">#{i + 1}</span>
                                        <span className="font-medium truncate">{p.name}</span>
                                    </span>
                                    <div className="flex items-center gap-3 shrink-0 ml-2">
                                        <span className="text-muted-foreground">{p.volume.toLocaleString()} units</span>
                                        <span className="font-mono">{formatCompact(p.value)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Price Inflation Trends */}
                {data.priceChanges.length > 0 && (
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">
                            Price Changes (30d vs Previous 30d)
                        </p>
                        <div className="space-y-1">
                            {data.priceChanges.map((p) => (
                                <div key={p.productName} className="flex items-center justify-between text-xs py-1.5 px-2 rounded border">
                                    <span className="font-medium truncate">{p.productName}</span>
                                    <div className="flex items-center gap-2 shrink-0 ml-2">
                                        <span className="text-muted-foreground font-mono">
                                            {formatCompact(p.previousAvg)} → {formatCompact(p.currentAvg)}
                                        </span>
                                        <Badge
                                            variant="secondary"
                                            className={`text-[10px] ${
                                                p.changePercent > 0 ? "bg-red-100 text-red-700" :
                                                p.changePercent < 0 ? "bg-emerald-100 text-emerald-700" :
                                                ""
                                            }`}
                                        >
                                            {p.changePercent > 0 ? <TrendingUp className="h-2.5 w-2.5 mr-0.5" /> : <TrendingDown className="h-2.5 w-2.5 mr-0.5" />}
                                            {p.changePercent > 0 ? "+" : ""}{p.changePercent}%
                                        </Badge>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Stock Overview — only show if there is data */}
                {(data.stockOverview.totalProducts > 0 || data.stockOverview.totalQuantity > 0) && (
                    <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-lg border p-2.5 text-center">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Products</p>
                            <p className="text-sm font-bold mt-0.5">{data.stockOverview.totalProducts}</p>
                        </div>
                        <div className="rounded-lg border p-2.5 text-center">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Stock</p>
                            <p className="text-sm font-bold mt-0.5">{data.stockOverview.totalQuantity.toLocaleString()}</p>
                        </div>
                        <div className="rounded-lg border p-2.5 text-center">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">⚠ Negative</p>
                            <p className={`text-sm font-bold mt-0.5 ${data.stockOverview.negativeStockProducts > 0 ? "text-red-600" : "text-emerald-600"}`}>
                                {data.stockOverview.negativeStockProducts}
                            </p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
