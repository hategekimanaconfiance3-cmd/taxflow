"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { PriceSuggestion } from "@/lib/ai/price-suggestion";
import { Brain, TrendingUp, AlertTriangle, ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// AI Price Range Bar
// Visual color-coded bar showing floor → ceiling with live price indicator.
// 🔴 Red = blocked (below floor)  🟢 Green = accepted  🟡 Yellow = flagged
// ---------------------------------------------------------------------------

interface PriceRangeBarProps {
    productId: string;
    currentPrice: number;
    compact?: boolean;
    onStatusChange?: (status: PriceStatus) => void;
}

type PriceStatus = "blocked" | "accepted" | "flagged" | "loading" | "no_data";

export function PriceRangeBar({ productId, currentPrice, compact, onStatusChange }: PriceRangeBarProps) {
    const [suggestion, setSuggestion] = useState<PriceSuggestion | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchSuggestion = useCallback(async () => {
        if (!productId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/ai/price-suggestion?productId=${productId}`);
            if (!res.ok) {
                throw new Error("Failed to fetch price suggestion");
            }
            const data = await res.json();
            setSuggestion(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load");
        } finally {
            setLoading(false);
        }
    }, [productId]);

    useEffect(() => {
        fetchSuggestion();
    }, [fetchSuggestion]);

    // Determine status
    const status: PriceStatus = (() => {
        if (loading || error || !suggestion || suggestion.status === "no_data") return "no_data";
        if (currentPrice <= 0) return "no_data";
        if (suggestion.floor > 0 && currentPrice < suggestion.floor) return "blocked";
        if (suggestion.ceiling > 0 && currentPrice > suggestion.ceiling) return "flagged";
        return "accepted";
    })();

    // Notify parent about status changes (ref-based to avoid infinite loops)
    const prevStatusRef = useRef<PriceStatus | null>(null);
    const onStatusChangeRef = useRef(onStatusChange);
    onStatusChangeRef.current = onStatusChange;

    useEffect(() => {
        if (prevStatusRef.current !== status) {
            prevStatusRef.current = status;
            onStatusChangeRef.current?.(status);
        }
    }, [status]);

    if (loading) {
        return (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>AI analyzing price…</span>
            </div>
        );
    }

    if (error || !suggestion) {
        return null;
    }

    if (suggestion.status === "no_data") {
        return (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-1">
                <Brain className="h-3 w-3" />
                <span>AI: No market data yet</span>
            </div>
        );
    }

    const { floor, ceiling, suggested, confidence, dataPoints, district } = suggestion;
    const range = ceiling - floor;
    const positionPct = range > 0
        ? Math.min(100, Math.max(0, ((currentPrice - floor) / range) * 100))
        : 50;

    if (compact) {
        return <CompactBar status={status} floor={floor} ceiling={ceiling} currentPrice={currentPrice} />;
    }

    return (
        <div className="space-y-1.5 py-1">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Brain className="h-3 w-3" />
                    <span>AI Price Range{district ? ` · ${district}` : ""}</span>
                    {confidence !== "high" && (
                        <span className="text-[10px] px-1 py-0.5 rounded bg-muted">
                            {confidence === "medium" ? "~" : "≈"}{dataPoints} txns
                        </span>
                    )}
                </div>
                <StatusBadge status={status} />
            </div>

            {/* Visual bar */}
            <div className="relative h-2.5 rounded-full overflow-hidden bg-muted/40">
                {/* Red zone (below floor — extends to the left) */}
                <div className="absolute inset-y-0 left-0 bg-red-400/30 dark:bg-red-500/20"
                    style={{ width: "10%" }}
                />
                {/* Green zone (floor to ceiling) */}
                <div className="absolute inset-y-0 bg-emerald-400/30 dark:bg-emerald-500/20"
                    style={{ left: "10%", width: "70%" }}
                />
                {/* Yellow zone (above ceiling) */}
                <div className="absolute inset-y-0 right-0 bg-amber-400/30 dark:bg-amber-500/20"
                    style={{ width: "20%" }}
                />

                {/* Suggested price marker */}
                <div
                    className="absolute top-0 bottom-0 w-0.5 bg-emerald-600/60"
                    style={{ left: `${10 + 70 * ((suggested - floor) / (range || 1))}%` }}
                />

                {/* Current price indicator */}
                {currentPrice > 0 && (
                    <div
                        className={`absolute top-[-2px] w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm
                            transition-all duration-200 ease-out
                            ${status === "blocked"
                                ? "bg-red-500"
                                : status === "flagged"
                                    ? "bg-amber-500"
                                    : "bg-emerald-500"
                            }`}
                        style={{
                            left: `calc(${status === "blocked"
                                ? Math.max(0, 10 * (currentPrice / (floor || 1)))
                                : status === "flagged"
                                    ? 80 + 20 * Math.min(1, (currentPrice - ceiling) / (ceiling * 0.5 || 1))
                                    : 10 + 70 * positionPct / 100
                                }% - 7px)`,
                        }}
                    />
                )}
            </div>

            {/* Labels */}
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                <span>{floor.toLocaleString()} RWF</span>
                <span className="text-emerald-600 font-medium">
                    ↑ {suggested.toLocaleString()}
                </span>
                <span>{ceiling.toLocaleString()} RWF</span>
            </div>

            {/* Status message */}
            {status === "blocked" && currentPrice > 0 && (
                <div className="flex items-start gap-1.5 text-xs text-red-600 bg-red-50 dark:bg-red-950/30 rounded px-2 py-1.5 border border-red-200 dark:border-red-900">
                    <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                        Price blocked — minimum in {district ?? "your area"} is{" "}
                        <strong>{floor.toLocaleString()} RWF</strong> based on {dataPoints} market transactions.
                    </span>
                </div>
            )}

            {status === "flagged" && (
                <div className="flex items-start gap-1.5 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded px-2 py-1.5 border border-amber-200 dark:border-amber-900">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                        Price above market ceiling — this will be flagged to RRA for review.
                    </span>
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: PriceStatus }) {
    switch (status) {
        case "blocked":
            return (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400">
                    <ShieldAlert className="h-2.5 w-2.5" />
                    Blocked
                </span>
            );
        case "accepted":
            return (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                    <ShieldCheck className="h-2.5 w-2.5" />
                    Accepted
                </span>
            );
        case "flagged":
            return (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    Flagged
                </span>
            );
        default:
            return null;
    }
}

function CompactBar({ status, floor, ceiling, currentPrice }: {
    status: PriceStatus;
    floor: number;
    ceiling: number;
    currentPrice: number;
}) {
    return (
        <div className="flex items-center gap-2 text-[10px] py-0.5">
            <TrendingUp className={`h-3 w-3 ${status === "blocked"
                ? "text-red-500"
                : status === "flagged"
                    ? "text-amber-500"
                    : "text-emerald-500"
                }`}
            />
            <span className="font-mono text-muted-foreground">
                {floor.toLocaleString()}–{ceiling.toLocaleString()} RWF
            </span>
            {status === "blocked" && currentPrice > 0 && (
                <span className="text-red-600 font-medium">↓ Too low</span>
            )}
            {status === "flagged" && (
                <span className="text-amber-600 font-medium">↑ Flagged</span>
            )}
        </div>
    );
}

// Export hook for use in forms
export function usePriceSuggestion(productId: string | null) {
    const [requestResult, setRequestResult] = useState<{
        productId: string;
        suggestion: PriceSuggestion | null;
    } | null>(null);

    useEffect(() => {
        if (!productId) {
            return;
        }

        let active = true;
        fetch(`/api/ai/price-suggestion?productId=${productId}`)
            .then(res => res.ok ? res.json() : null)
            .then((data: PriceSuggestion | null) => {
                if (active) setRequestResult({ productId, suggestion: data });
            })
            .catch(() => {
                if (active) setRequestResult({ productId, suggestion: null });
            });
        return () => { active = false; };
    }, [productId]);

    return {
        suggestion: requestResult?.productId === productId ? requestResult.suggestion : null,
        loading: productId !== null && requestResult?.productId !== productId,
    };
}
