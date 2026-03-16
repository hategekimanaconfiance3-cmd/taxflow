"use client";

import { ShieldAlert, ShieldCheck, AlertTriangle, AlertCircle } from "lucide-react";

// ---------------------------------------------------------------------------
// Risk Score Badge — visual indicator for merchant risk level
// ---------------------------------------------------------------------------

interface RiskScoreBadgeProps {
    score: number;
    level: "low" | "medium" | "high" | "critical";
    showScore?: boolean;
    size?: "sm" | "md";
}

const config = {
    low: {
        icon: ShieldCheck,
        bg: "bg-emerald-100 dark:bg-emerald-950",
        text: "text-emerald-700 dark:text-emerald-400",
        label: "Low Risk",
    },
    medium: {
        icon: AlertCircle,
        bg: "bg-amber-100 dark:bg-amber-950",
        text: "text-amber-700 dark:text-amber-400",
        label: "Medium",
    },
    high: {
        icon: AlertTriangle,
        bg: "bg-orange-100 dark:bg-orange-950",
        text: "text-orange-700 dark:text-orange-400",
        label: "High Risk",
    },
    critical: {
        icon: ShieldAlert,
        bg: "bg-red-100 dark:bg-red-950",
        text: "text-red-700 dark:text-red-400",
        label: "Critical",
    },
};

export function RiskScoreBadge({ score, level, showScore = true, size = "sm" }: RiskScoreBadgeProps) {
    const c = config[level];
    const Icon = c.icon;
    const isSmall = size === "sm";

    return (
        <span
            className={`inline-flex items-center gap-1 font-medium rounded-full
                ${c.bg} ${c.text}
                ${isSmall ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1"}`}
        >
            <Icon className={isSmall ? "h-2.5 w-2.5" : "h-3.5 w-3.5"} />
            {showScore ? `${score}` : c.label}
        </span>
    );
}

// ---------------------------------------------------------------------------
// Risk Factor Bar — visual breakdown of individual risk factors
// ---------------------------------------------------------------------------

interface RiskFactorBarProps {
    signal: string;
    value: number;
    weight: number;
    description: string;
}

export function RiskFactorBar({ signal, value, weight, description }: RiskFactorBarProps) {
    const color =
        value >= 75 ? "bg-red-500" :
        value >= 50 ? "bg-orange-500" :
        value >= 25 ? "bg-amber-500" : "bg-emerald-500";

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{signal}</span>
                <span className="text-muted-foreground">
                    {value}/100 × {Math.round(weight * 100)}%
                </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-300 ${color}`}
                    style={{ width: `${value}%` }}
                />
            </div>
            <p className="text-[10px] text-muted-foreground">{description}</p>
        </div>
    );
}
