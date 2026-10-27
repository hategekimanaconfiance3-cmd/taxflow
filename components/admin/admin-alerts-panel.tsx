"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
    AlertTriangle,
    Banknote,
    Bell,
    CheckCircle,
    CreditCard,
    ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { formatRWF } from "@/components/dashboard/stat-card/stat-card";
import type { TaxpayerRow } from "@/lib/actions/admin-taxpayer-overview.action";

interface AlertsPanelProps {
    pendingPayments: {
        count: number;
        total: number;
    };
    nonCompliantTraders: TaxpayerRow[];
    recentPayments: {
        id: string;
        amount: number;
        method: string | null;
        reference: string | null;
        status: string;
        createdAt: Date;
        businessName: string | null;
    }[];
}

export function AdminAlertsPanel({
    pendingPayments,
    nonCompliantTraders,
    recentPayments,
}: AlertsPanelProps) {
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Bell className="h-4 w-4 text-amber-500" />
                    Alerts & Notifications
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Pending Payments */}
                {pendingPayments.count > 0 && (
                    <Link
                        href="/admin/payments"
                        className="flex items-center justify-between group"
                    >
                        <div className="flex items-center gap-2">
                            <Badge
                                variant="secondary"
                                className="bg-amber-500/10 text-amber-600 text-xs font-bold"
                            >
                                {pendingPayments.count}
                            </Badge>
                            <span className="text-sm font-medium text-amber-700">
                                Pending Payments
                            </span>
                        </div>
                        <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                            View All
                        </span>
                    </Link>
                )}

                {/* Compliance Reminders */}
                <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                        Compliance Reminders
                    </p>
                    <div className="space-y-1.5">
                        {nonCompliantTraders.length > 0 ? (
                            nonCompliantTraders.map((t) => (
                                <div
                                    key={t.id}
                                    className="flex items-start gap-2 text-xs"
                                >
                                    <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                                    <span className="text-muted-foreground">
                                        Remind{" "}
                                        <Link
                                            href={`/admin/traders/${t.id}`}
                                            className="font-medium text-foreground hover:underline"
                                        >
                                            {t.businessName ?? "Unknown"}
                                        </Link>{" "}
                                        to file VAT return —{" "}
                                        <span className="font-mono text-red-600">
                                            {formatRWF(t.outstanding)}
                                        </span>{" "}
                                        outstanding
                                    </span>
                                </div>
                            ))
                        ) : (
                            <div className="flex items-center gap-2 text-xs text-emerald-600">
                                <CheckCircle className="h-3 w-3" />
                                All traders are compliant
                            </div>
                        )}
                    </div>
                </div>

                <Separator />

                {/* Recently Filed / Payments */}
                <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                        Recent Payments
                    </p>
                    <div className="space-y-2">
                        {recentPayments.length > 0 ? (
                            recentPayments.map((p) => (
                                <div
                                    key={p.id}
                                    className="flex items-center justify-between text-xs"
                                >
                                    <div className="flex items-center gap-2">
                                        <CreditCard className="h-3 w-3 text-muted-foreground/60" />
                                        <span className="font-medium">
                                            {p.businessName ?? "Unknown"}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-muted-foreground">
                                            {formatRWF(p.amount)}
                                        </span>
                                        <Badge
                                            variant="secondary"
                                            className={`text-[10px] ${p.status === "confirmed"
                                                    ? "bg-emerald-500/10 text-emerald-600"
                                                    : "bg-amber-500/10 text-amber-600"
                                                }`}
                                        >
                                            {p.status}
                                        </Badge>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                No payments yet
                            </p>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
