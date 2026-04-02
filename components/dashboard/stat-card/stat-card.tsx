import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
    title: string;
    value: string | number;
    description?: string;
    icon?: React.ReactNode;
    trend?: {
        value: string;
        positive: boolean;
    };
    className?: string;
}

export function StatCard({
    title,
    value,
    description,
    icon,
    trend,
    className,
}: StatCardProps) {
    return (
        <Card className={cn("relative overflow-hidden flex flex-col h-full", className)}>
            <CardHeader className="flex flex-row items-start justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground leading-tight">
                    {title}
                </CardTitle>
                {icon && (
                    <div className="text-muted-foreground/50 shrink-0">{icon}</div>
                )}
            </CardHeader>
            <CardContent className="pt-0 mt-auto">
                <div className="text-lg font-bold truncate" title={String(value)}>
                    {value}
                </div>
                {description && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                        {description}
                    </p>
                )}
                {trend && (
                    <p
                        className={cn(
                            "text-xs font-medium mt-1",
                            trend.positive
                                ? "text-emerald-600"
                                : "text-red-500",
                        )}
                    >
                        {trend.positive ? "↑" : "↓"} {trend.value}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

/**
 * Format RWF currency (stored as integers).
 * Uses compact notation for large values (e.g., 2.5M, 448K, 4.05B).
 */
export function formatRWF(amount: number): string {
    const num = Number(amount) || 0;
    if (num === 0) return "0 RWF";
    const abs = Math.abs(num);
    const sign = num < 0 ? "-" : "";
    if (abs >= 1_000_000_000_000) {
        return `${sign}${(abs / 1_000_000_000_000).toFixed(1)}T RWF`;
    }
    if (abs >= 1_000_000_000) {
        return `${sign}${(abs / 1_000_000_000).toFixed(2)}B RWF`;
    }
    if (abs >= 1_000_000) {
        return `${sign}${(abs / 1_000_000).toFixed(1)}M RWF`;
    }
    if (abs >= 10_000) {
        return `${sign}${(abs / 1_000).toFixed(0)}K RWF`;
    }
    return `${sign}${new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(abs)} RWF`;
}

/**
 * Format RWF currency — full format (no abbreviation).
 */
export function formatRWFFull(amount: number): string {
    const num = Number(amount) || 0;
    if (num === 0) return "0 RWF";
    const sign = num < 0 ? "-" : "";
    const abs = Math.abs(num);
    return `${sign}${new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(abs)} RWF`;
}
