"use client";

import { useEffect, useState } from "react";
import type { SmartAlertsData } from "@/lib/actions/smart-alerts.action";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Bell, AlertTriangle, AlertCircle, Info } from "lucide-react";

// ---------------------------------------------------------------------------
// Smart Alerts Panel — automated fraud/compliance alerts
// ---------------------------------------------------------------------------

const SEVERITY_CONFIG = {
    critical: {
        icon: <AlertTriangle className="h-3.5 w-3.5" />,
        bg: "bg-red-50 border-red-200",
        text: "text-red-700",
        badge: "bg-red-100 text-red-700",
    },
    warning: {
        icon: <AlertCircle className="h-3.5 w-3.5" />,
        bg: "bg-amber-50 border-amber-200",
        text: "text-amber-700",
        badge: "bg-amber-100 text-amber-700",
    },
    info: {
        icon: <Info className="h-3.5 w-3.5" />,
        bg: "bg-blue-50 border-blue-200",
        text: "text-blue-700",
        badge: "bg-blue-100 text-blue-700",
    },
} as const;

export function SmartAlertsPanel() {
    const [data, setData] = useState<SmartAlertsData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/admin/smart-alerts")
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
                        Analyzing for alerts…
                    </span>
                </CardContent>
            </Card>
        );
    }

    if (!data || data.alerts.length === 0) {
        return (
            <Card>
                <CardContent className="py-8 text-center">
                    <Bell className="h-8 w-8 mx-auto text-emerald-500 mb-2" />
                    <p className="text-sm font-medium">No active alerts</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        All systems operating normally.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Bell className="h-4 w-4" />
                        Smart Alerts
                    </CardTitle>
                    <div className="flex items-center gap-1.5">
                        {data.criticalCount > 0 && (
                            <Badge variant="secondary" className="bg-red-100 text-red-700 text-[10px]">
                                {data.criticalCount} critical
                            </Badge>
                        )}
                        {data.warningCount > 0 && (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-[10px]">
                                {data.warningCount} warning
                            </Badge>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-2">
                {data.alerts.map((alert) => {
                    const config = SEVERITY_CONFIG[alert.severity];
                    return (
                        <div
                            key={alert.id}
                            className={`flex items-start gap-2.5 rounded-lg border p-2.5 ${config.bg}`}
                        >
                            <div className={`mt-0.5 shrink-0 ${config.text}`}>
                                {config.icon}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                    <p className={`text-xs font-semibold ${config.text}`}>
                                        {alert.title}
                                    </p>
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                                    {alert.description}
                                </p>
                            </div>
                            <Badge
                                variant="secondary"
                                className={`text-[9px] shrink-0 ${config.badge}`}
                            >
                                {alert.type.replace(/_/g, " ")}
                            </Badge>
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
}
