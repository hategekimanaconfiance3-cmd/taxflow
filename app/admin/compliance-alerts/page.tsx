import { requireRRASession } from "@/lib/auth-guard";
import { generateComplianceAlerts } from "@/lib/actions/admin-compliance-alert.action";
import { SendAlertButton } from "@/components/admin/compliance-alert-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldAlert, Bell, CheckCircle } from "lucide-react";
import Link from "next/link";

const SEVERITY_CONFIG: Record<string, { color: string; bg: string }> = {
    low: { color: "text-blue-600", bg: "bg-blue-500/10" },
    medium: { color: "text-amber-600", bg: "bg-amber-500/10" },
    high: { color: "text-orange-600", bg: "bg-orange-500/10" },
    critical: { color: "text-red-600", bg: "bg-red-500/10" },
};

const ALERT_TYPE_LABELS: Record<string, string> = {
    overdue_vat: "Overdue VAT",
    low_compliance: "Low Compliance",
    no_recent_activity: "No Activity",
    negative_stock: "Negative Stock",
};

export default async function ComplianceAlertsPage() {
    await requireRRASession("compliance_officer", "audit_officer");
    const alerts = await generateComplianceAlerts();

    const critical = alerts.filter((a) => a.severity === "critical").length;
    const high = alerts.filter((a) => a.severity === "high").length;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    Compliance Alerts
                </h1>
                <p className="text-muted-foreground">
                    Automated alerts for VAT deadlines, inactivity, and
                    compliance issues.
                </p>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <ShieldAlert className="h-8 w-8 text-red-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">
                                Critical
                            </p>
                            <p className="text-2xl font-bold">{critical}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <AlertTriangle className="h-8 w-8 text-orange-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">
                                High Priority
                            </p>
                            <p className="text-2xl font-bold">{high}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <Bell className="h-8 w-8 text-blue-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">
                                Total Alerts
                            </p>
                            <p className="text-2xl font-bold">
                                {alerts.length}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Alert list */}
            {alerts.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <CheckCircle className="h-10 w-10 mx-auto text-emerald-500 mb-3" />
                        <p className="font-medium">All clear</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            No compliance alerts at this time.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {alerts.map((alert, i) => {
                        const cfg =
                            SEVERITY_CONFIG[alert.severity] ??
                            SEVERITY_CONFIG.medium;
                        return (
                            <Card key={`${alert.traderId}-${alert.alertType}-${i}`}>
                                <CardContent className="py-4">
                                    <div className="flex items-start gap-3">
                                        <AlertTriangle
                                            className={`h-5 w-5 mt-0.5 flex-shrink-0 ${cfg.color}`}
                                        />
                                        <div className="flex-1 min-w-0 space-y-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <Link
                                                    href={`/admin/traders/${alert.traderId}`}
                                                    className="text-sm font-medium hover:underline"
                                                >
                                                    {alert.traderName}
                                                </Link>
                                                <Badge
                                                    variant="outline"
                                                    className={`text-[10px] ${cfg.color} ${cfg.bg}`}
                                                >
                                                    {alert.severity}
                                                </Badge>
                                                <Badge
                                                    variant="outline"
                                                    className="text-[10px]"
                                                >
                                                    {ALERT_TYPE_LABELS[
                                                        alert.alertType
                                                    ] ?? alert.alertType}
                                                </Badge>
                                                <Badge
                                                    variant="outline"
                                                    className="text-[10px] capitalize"
                                                >
                                                    {alert.role}
                                                </Badge>
                                                <div className="ml-auto">
                                                    <SendAlertButton
                                                        traderId={
                                                            alert.traderId
                                                        }
                                                        alertType={
                                                            alert.alertType
                                                        }
                                                        description={
                                                            alert.description
                                                        }
                                                    />
                                                </div>
                                            </div>
                                            <p className="text-sm text-muted-foreground">
                                                {alert.description}
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
