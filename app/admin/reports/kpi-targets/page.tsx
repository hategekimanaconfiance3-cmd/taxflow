import { requireRRASession } from "@/lib/auth-guard";
import { getKPIProgress } from "@/lib/actions/admin-kpi-targets.action";
import { formatRWF } from "@/components/dashboard/stat-card/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, TrendingDown, Minus } from "lucide-react";

const STATUS_CONFIG = {
    on_track: { label: "On Track", variant: "default" as const, color: "bg-green-500" },
    at_risk: { label: "At Risk", variant: "secondary" as const, color: "bg-amber-500" },
    behind: { label: "Behind", variant: "destructive" as const, color: "bg-red-500" },
    no_target: { label: "No Target Set", variant: "outline" as const, color: "bg-muted" },
};

function formatValue(value: number, unit: string): string {
    if (unit === "RWF") return formatRWF(value);
    if (unit === "%") return `${value}%`;
    return value.toLocaleString();
}

export default async function KPITargetsPage() {
    await requireRRASession("super_admin", "compliance_officer", "reporting_officer");
    const report = await getKPIProgress();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    KPI Targets & Progress
                </h1>
                <p className="text-muted-foreground">
                    Track performance against corporate priorities.
                </p>
            </div>

            {/* Summary */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <Target className="h-8 w-8 text-blue-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">Total KPIs</p>
                            <p className="text-2xl font-bold">{report.metrics.length}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <TrendingUp className="h-8 w-8 text-green-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">On Track</p>
                            <p className="text-2xl font-bold">
                                {report.metrics.filter((m) => m.status === "on_track").length}
                            </p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <TrendingDown className="h-8 w-8 text-red-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">Needs Attention</p>
                            <p className="text-2xl font-bold">
                                {report.metrics.filter((m) => m.status === "behind" || m.status === "at_risk").length}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {report.metrics.map((metric) => {
                    const cfg = STATUS_CONFIG[metric.status];
                    return (
                        <Card key={metric.key}>
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-medium">
                                        {metric.label}
                                    </CardTitle>
                                    <Badge variant={cfg.variant} className="text-[10px]">
                                        {cfg.label}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex items-end justify-between">
                                    <div>
                                        <p className="text-2xl font-bold">
                                            {formatValue(metric.currentValue, metric.unit)}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            current value
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-semibold text-muted-foreground">
                                            {metric.targetValue !== null
                                                ? formatValue(metric.targetValue, metric.unit)
                                                : "—"}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            target
                                        </p>
                                    </div>
                                </div>
                                {/* Progress bar */}
                                <div className="w-full bg-muted rounded-full h-2">
                                    <div
                                        className={`${cfg.color} h-2 rounded-full transition-all`}
                                        style={{
                                            width: `${Math.max(2, Math.min(100, metric.progressPct))}%`,
                                        }}
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground text-right">
                                    {metric.progressPct}% of target
                                </p>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <p className="text-xs text-muted-foreground text-center">
                Last computed: {report.computedAt.toLocaleString()}
            </p>
        </div>
    );
}
