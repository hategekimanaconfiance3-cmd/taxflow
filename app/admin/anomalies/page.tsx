import { requireRRASession } from "@/lib/auth-guard";
import { detectAnomalies } from "@/lib/actions/admin-anomaly.action";
import type { Anomaly } from "@/lib/actions/admin-anomaly.action";
import { formatRWF } from "@/components/dashboard/stat-card/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    AlertTriangle,
    ShieldAlert,
    TrendingUp,
    Copy,
    PackageMinus,
    DollarSign,
    Brain,
} from "lucide-react";

const ANOMALY_META: Record<
    string,
    { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
    high_quantity: {
        label: "High Quantity",
        icon: TrendingUp,
        color: "text-amber-600",
    },
    high_value: {
        label: "High Value",
        icon: DollarSign,
        color: "text-orange-600",
    },
    duplicate_sale: {
        label: "Duplicate Sale",
        icon: Copy,
        color: "text-violet-600",
    },
    exceeds_stock: {
        label: "Negative Stock",
        icon: PackageMinus,
        color: "text-red-600",
    },
    high_risk_score: {
        label: "AI Risk Flag",
        icon: Brain,
        color: "text-blue-600",
    },
};

export default async function AnomaliesPage() {
    await requireRRASession("compliance_officer", "audit_officer");
    const anomalies = await detectAnomalies();

    const critical = anomalies.filter((a) => a.severity === "critical");
    const warnings = anomalies.filter((a) => a.severity === "warning");

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    Anomaly Detection
                </h1>
                <p className="text-muted-foreground">
                    Suspicious patterns detected in the last 30 days.
                </p>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <ShieldAlert className="h-8 w-8 text-red-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">Critical</p>
                            <p className="text-2xl font-bold">{critical.length}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <AlertTriangle className="h-8 w-8 text-amber-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">Warnings</p>
                            <p className="text-2xl font-bold">{warnings.length}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <div>
                            <p className="text-sm text-muted-foreground">Total Anomalies</p>
                            <p className="text-2xl font-bold">{anomalies.length}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Anomaly list */}
            {anomalies.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <ShieldAlert className="h-10 w-10 mx-auto text-emerald-500 mb-3" />
                        <p className="font-medium">No anomalies detected</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            All transactions in the last 30 days appear normal.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {anomalies.map((a, i) => (
                        <AnomalyCard key={`${a.transactionId}-${i}`} anomaly={a} />
                    ))}
                </div>
            )}
        </div>
    );
}

function AnomalyCard({ anomaly }: { anomaly: Anomaly }) {
    const meta = ANOMALY_META[anomaly.type] ?? ANOMALY_META.high_quantity;
    const Icon = meta.icon;

    return (
        <Card
            className={
                anomaly.severity === "critical"
                    ? "border-red-200 bg-red-50/30"
                    : "border-amber-200 bg-amber-50/20"
            }
        >
            <CardContent className="py-4">
                <div className="flex items-start gap-3">
                    <Icon
                        className={`h-5 w-5 mt-0.5 flex-shrink-0 ${meta.color}`}
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                                variant="outline"
                                className={`text-[10px] ${meta.color}`}
                            >
                                {meta.label}
                            </Badge>
                            <Badge
                                variant={
                                    anomaly.severity === "critical"
                                        ? "destructive"
                                        : "secondary"
                                }
                                className="text-[10px]"
                            >
                                {anomaly.severity}
                            </Badge>
                            <span className="text-xs text-muted-foreground ml-auto">
                                {new Date(anomaly.date).toLocaleDateString()}
                            </span>
                        </div>
                        <p className="text-sm">{anomaly.description}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>
                                <strong>Product:</strong> {anomaly.productName}
                            </span>
                            <span>
                                <strong>Seller:</strong> {anomaly.sellerName}
                            </span>
                            {anomaly.buyerName && (
                                <span>
                                    <strong>Buyer:</strong> {anomaly.buyerName}
                                </span>
                            )}
                            {anomaly.totalAmount > 0 && (
                                <span>
                                    <strong>Amount:</strong>{" "}
                                    {formatRWF(anomaly.totalAmount)}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
