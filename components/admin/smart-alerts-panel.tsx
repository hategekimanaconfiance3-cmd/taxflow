"use client";

import { useEffect, useState } from "react";
import type { SmartAlertsData, SmartAlert } from "@/lib/actions/smart-alerts.action";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Bell, AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp } from "lucide-react";

// ---------------------------------------------------------------------------
// Smart Alerts Panel — grouped by type with severity indicators
// ---------------------------------------------------------------------------

const SEVERITY_CONFIG = {
    critical: {
        icon: <AlertTriangle className="h-3.5 w-3.5" />,
        dot: "bg-red-500",
        bg: "bg-red-50 border-red-200",
        text: "text-red-700",
        badge: "bg-red-100 text-red-700",
        label: "Critical",
    },
    warning: {
        icon: <AlertCircle className="h-3.5 w-3.5" />,
        dot: "bg-amber-500",
        bg: "bg-amber-50 border-amber-200",
        text: "text-amber-700",
        badge: "bg-amber-100 text-amber-700",
        label: "Warning",
    },
    info: {
        icon: <Info className="h-3.5 w-3.5" />,
        dot: "bg-blue-500",
        bg: "bg-blue-50 border-blue-200",
        text: "text-blue-700",
        badge: "bg-blue-100 text-blue-700",
        label: "Info",
    },
} as const;

const TYPE_LABELS: Record<string, string> = {
    below_cost: "Below Cost Sales",
    unrealistic_production: "Unrealistic Production",
    vat_mismatch: "VAT Mismatch",
    transaction_spike: "Transaction Spike",
    negative_stock: "Negative Stock",
    compliance_flag: "Compliance Flag",
};

interface AlertGroup {
    type: string;
    label: string;
    severity: "critical" | "warning" | "info";
    alerts: SmartAlert[];
}

function groupAlerts(alerts: SmartAlert[]): AlertGroup[] {
    const grouped = new Map<string, SmartAlert[]>();
    for (const alert of alerts) {
        const key = `${alert.type}-${alert.severity}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(alert);
    }

    const severityOrder = { critical: 0, warning: 1, info: 2 };

    return Array.from(grouped.entries())
        .map(([key, groupAlerts]) => {
            const first = groupAlerts[0];
            return {
                type: key,
                label: TYPE_LABELS[first.type] ?? first.type.replace(/_/g, " "),
                severity: first.severity,
                alerts: groupAlerts,
            };
        })
        .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

export function SmartAlertsPanel() {
    const [data, setData] = useState<SmartAlertsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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
                    <p className="text-sm font-medium">No critical alerts at this time</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        System scans VAT records, stock levels, and transaction patterns — all within normal bounds.
                    </p>
                </CardContent>
            </Card>
        );
    }

    const groups = groupAlerts(data.alerts);

    const toggleGroup = (groupType: string): void => {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(groupType)) {
                next.delete(groupType);
            } else {
                next.add(groupType);
            }
            return next;
        });
    };

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
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1" />
                                {data.criticalCount} critical
                            </Badge>
                        )}
                        {data.warningCount > 0 && (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-[10px]">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-1" />
                                {data.warningCount} warning
                            </Badge>
                        )}
                        {data.totalCount - data.criticalCount - data.warningCount > 0 && (
                            <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-[10px]">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1" />
                                {data.totalCount - data.criticalCount - data.warningCount} info
                            </Badge>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-2">
                {groups.map((group) => {
                    const config = SEVERITY_CONFIG[group.severity];
                    const isExpanded = expandedGroups.has(group.type);

                    return (
                        <div key={group.type} className={`rounded-lg border ${config.bg} overflow-hidden`}>
                            {/* Group header — clickable */}
                            <button
                                onClick={() => toggleGroup(group.type)}
                                className="w-full flex items-center justify-between gap-2 p-2.5 text-left hover:opacity-80 transition-opacity"
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className={`shrink-0 ${config.text}`}>{config.icon}</span>
                                    <span className={`text-xs font-semibold ${config.text}`}>
                                        {group.label}
                                    </span>
                                    <Badge variant="secondary" className={`text-[9px] ${config.badge}`}>
                                        {group.alerts.length} {group.alerts.length === 1 ? "case" : "cases"}
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <Badge variant="secondary" className={`text-[9px] px-1.5 ${config.badge}`}>
                                        {config.label}
                                    </Badge>
                                    {isExpanded
                                        ? <ChevronUp className={`h-3.5 w-3.5 ${config.text}`} />
                                        : <ChevronDown className={`h-3.5 w-3.5 ${config.text}`} />
                                    }
                                </div>
                            </button>

                            {/* Expanded details */}
                            {isExpanded && (
                                <div className="border-t border-inherit px-2.5 pb-2.5 space-y-1.5">
                                    {group.alerts.map((alert) => (
                                        <div
                                            key={alert.id}
                                            className="flex items-start gap-2 pt-2 text-[11px]"
                                        >
                                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${config.dot} mt-1 shrink-0`} />
                                            <div className="min-w-0">
                                                <span className={`font-medium ${config.text}`}>
                                                    {alert.traderName}
                                                </span>
                                                <span className="text-muted-foreground ml-1">
                                                    — {alert.description}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
}
