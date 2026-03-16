import { requireRRASession } from "@/lib/auth-guard";
import { getDataQualityMetrics } from "@/lib/actions/admin-data-quality.action";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Database, AlertTriangle, Activity } from "lucide-react";

function ScoreBar({ score }: { score: number }) {
    const color =
        score >= 80 ? "bg-green-500" : score >= 60 ? "bg-amber-500" : "bg-red-500";
    return (
        <div className="w-full bg-muted rounded-full h-3">
            <div
                className={`${color} h-3 rounded-full transition-all`}
                style={{ width: `${Math.max(2, score)}%` }}
            />
        </div>
    );
}

function MetricCard({
    label,
    value,
    subtext,
}: {
    label: string;
    value: string | number;
    subtext?: string;
}) {
    return (
        <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-xl font-bold">{value}</p>
            {subtext && (
                <p className="text-xs text-muted-foreground">{subtext}</p>
            )}
        </div>
    );
}

export default async function DataQualityPage() {
    await requireRRASession("compliance_officer", "audit_officer", "super_admin");
    const metrics = await getDataQualityMetrics();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    Data Quality Dashboard
                </h1>
                <p className="text-muted-foreground">
                    System data health and integrity metrics.
                </p>
            </div>

            {/* Overall Score */}
            <Card>
                <CardContent className="pt-6 space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <ShieldCheck className="h-8 w-8 text-blue-500" />
                            <div>
                                <p className="text-sm text-muted-foreground">
                                    Overall Data Quality Score
                                </p>
                                <p className="text-3xl font-bold">
                                    {metrics.overallScore}%
                                </p>
                            </div>
                        </div>
                    </div>
                    <ScoreBar score={metrics.overallScore} />
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {/* Trader Completeness */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Database className="h-4 w-4" /> Trader Profiles
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <MetricCard
                            label="Completeness Rate"
                            value={`${metrics.traderCompleteness.completenessRate}%`}
                        />
                        <ScoreBar score={metrics.traderCompleteness.completenessRate} />
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <MetricCard
                                label="Missing Phone"
                                value={metrics.traderCompleteness.missingPhone}
                            />
                            <MetricCard
                                label="Missing TIN"
                                value={metrics.traderCompleteness.missingTin}
                            />
                            <MetricCard
                                label="Missing Name"
                                value={metrics.traderCompleteness.missingBusinessName}
                            />
                            <MetricCard
                                label="Total"
                                value={metrics.traderCompleteness.total}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Transaction Health */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Activity className="h-4 w-4" /> Transaction Health
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <MetricCard
                            label="Success Rate"
                            value={`${100 - metrics.transactionHealth.rejectionRate - metrics.transactionHealth.expirationRate}%`}
                        />
                        <ScoreBar
                            score={
                                100 -
                                metrics.transactionHealth.rejectionRate -
                                metrics.transactionHealth.expirationRate
                            }
                        />
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <MetricCard
                                label="Rejected"
                                value={metrics.transactionHealth.rejected}
                                subtext={`${metrics.transactionHealth.rejectionRate}%`}
                            />
                            <MetricCard
                                label="Expired"
                                value={metrics.transactionHealth.expired}
                                subtext={`${metrics.transactionHealth.expirationRate}%`}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Stock Integrity */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4" /> Stock Integrity
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <MetricCard
                            label="Integrity Rate"
                            value={`${100 - metrics.stockIntegrity.negativeStockRate}%`}
                        />
                        <ScoreBar score={100 - metrics.stockIntegrity.negativeStockRate} />
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <MetricCard
                                label="Negative Stock"
                                value={metrics.stockIntegrity.negativeStock}
                            />
                            <MetricCard
                                label="Corrections"
                                value={metrics.stockIntegrity.corrections}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Audit Activity */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4" /> Audit Activity
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <MetricCard
                            label="Total Entries"
                            value={metrics.auditActivity.totalEntries.toLocaleString()}
                        />
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <MetricCard
                                label="Last 7 Days"
                                value={metrics.auditActivity.last7Days}
                            />
                            <MetricCard
                                label="Last 30 Days"
                                value={metrics.auditActivity.last30Days}
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
