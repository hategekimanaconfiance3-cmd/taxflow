"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface StockPieProps {
    produced: number;
    sold: number;
    remaining: number;
}

const SEGMENTS = [
    { key: "Produced", color: "#3b82f6" },
    { key: "Remaining", color: "#f59e0b" },
    { key: "Sold", color: "#22c55e" },
] as const;

function formatCompact(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

export function StockPie({ produced, sold, remaining }: StockPieProps) {
    // Force numeric conversion — DB may return strings
    const values = [Number(produced) || 0, Number(remaining) || 0, Number(sold) || 0];
    const total = values[0] + values[1] + values[2];

    if (total === 0) {
        return (
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">
                        Stock Status
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                        No stock data yet
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Calculate percentages — enforce a minimum of 3% for tiny slices
    // so they remain visible in the donut
    const MIN_PCT = 3;
    const rawPcts = values.map((v) => (v / total) * 100);
    const visibleCount = rawPcts.filter((p) => p > 0).length;

    let displayPcts: number[];
    if (visibleCount <= 1) {
        // Only one segment — show it fully
        displayPcts = rawPcts;
    } else {
        // Clamp small segments to MIN_PCT for visibility
        const clamped = rawPcts.map((p) => (p > 0 ? Math.max(p, MIN_PCT) : 0));
        const clampedTotal = clamped.reduce((a, b) => a + b, 0);
        displayPcts = clamped.map((p) => (p / clampedTotal) * 100);
    }

    // Build conic-gradient
    let acc = 0;
    const stops = displayPcts.map((pct, i) => {
        const start = acc;
        const end = acc + pct;
        acc = end;
        return `${SEGMENTS[i].color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    });
    const gradient = `conic-gradient(${stops.join(", ")})`;

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                    Stock Status
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col items-center gap-4">
                    {/* Donut ring */}
                    <div className="relative">
                        <div
                            className="w-[160px] h-[160px] rounded-full"
                            style={{ background: gradient }}
                        />
                        <div className="absolute inset-[30px] rounded-full bg-card flex items-center justify-center">
                            <div className="text-center">
                                <p className="text-base font-bold leading-tight">
                                    {formatCompact(total)}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                    Total Units
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Legend — numbers show on hover */}
                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
                        {SEGMENTS.map((seg, i) => {
                            if (values[i] === 0) return null;
                            return (
                                <div
                                    key={seg.key}
                                    className="flex items-center gap-1.5 cursor-default"
                                    title={`${formatCompact(values[i])} (${rawPcts[i].toFixed(1)}%)`}
                                >
                                    <span
                                        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                                        style={{ backgroundColor: seg.color }}
                                    />
                                    <span className="text-muted-foreground">
                                        {seg.key}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
