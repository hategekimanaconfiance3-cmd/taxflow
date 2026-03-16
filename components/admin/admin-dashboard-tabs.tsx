"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    ArrowLeftRight,
    Ship,
    Shield,
    ScrollText,
    ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { formatRWF } from "@/components/dashboard/stat-card/stat-card";

interface AdminDashboardTabsProps {
    transactions: {
        id: string;
        sellerName: string | null;
        productName: string;
        totalAmount: number;
        vatAmount: number;
        status: string;
        createdAt: Date;
    }[];
    imports: {
        id: string;
        businessName: string | null;
        productName: string;
        expectedQuantity: number;
        actualQuantity: number | null;
        status: string;
        createdAt: Date;
    }[];
    disputes: {
        id: string;
        referenceNumber: string;
        reason: string;
        status: string;
        counterpartyResponse: string;
        createdAt: Date;
        filedByName: string | null;
    }[];
    audit: {
        id: string;
        action: string;
        targetType: string | null;
        targetId: string | null;
        createdAt: Date;
        userName: string | null;
    }[];
}

const TABS = [
    { key: "transactions", label: "Transactions", icon: ArrowLeftRight, href: "/admin/transactions" },
    { key: "imports", label: "Imports", icon: Ship, href: "/admin/imports" },
    { key: "disputes", label: "Disputes", icon: Shield, href: "/admin/disputes" },
    { key: "audit", label: "Audit", icon: ScrollText, href: "/admin/audit" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const statusColors: Record<string, string> = {
    pending: "bg-amber-500/10 text-amber-600",
    confirmed: "bg-emerald-500/10 text-emerald-600",
    completed: "bg-blue-500/10 text-blue-600",
    rejected: "bg-red-500/10 text-red-600",
    submitted: "bg-violet-500/10 text-violet-600",
    activated: "bg-emerald-500/10 text-emerald-600",
    filed: "bg-amber-500/10 text-amber-600",
    under_review: "bg-blue-500/10 text-blue-600",
    resolved: "bg-emerald-500/10 text-emerald-600",
    dismissed: "bg-zinc-500/10 text-zinc-600",
};

function formatAction(action: string) {
    return action
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AdminDashboardTabs({
    transactions,
    imports,
    disputes,
    audit,
}: AdminDashboardTabsProps) {
    const [tab, setTab] = useState<TabKey>("transactions");
    const activeTab = TABS.find((t) => t.key === tab)!;

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold">
                        Recent Activity
                    </CardTitle>
                    <Link
                        href={activeTab.href}
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                        View All {activeTab.label}
                        <ArrowRight className="h-3 w-3" />
                    </Link>
                </div>
                {/* Tab bar */}
                <div className="flex items-center mt-3 rounded-md border border-border/60 bg-background w-fit overflow-hidden">
                    {TABS.map((t) => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-medium transition-colors border-r last:border-r-0 border-border/60 ${tab === t.key
                                    ? "bg-accent text-foreground"
                                    : "text-muted-foreground hover:bg-accent/50"
                                }`}
                        >
                            <t.icon className="h-3.5 w-3.5" />
                            {t.label}
                        </button>
                    ))}
                </div>
            </CardHeader>
            <CardContent>
                {/* Transactions tab */}
                {tab === "transactions" && (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Seller</TableHead>
                                <TableHead>Product</TableHead>
                                <TableHead className="text-right">
                                    Amount
                                </TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">
                                    Date
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {transactions.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={5}
                                        className="text-center text-sm text-muted-foreground py-8"
                                    >
                                        No recent transactions
                                    </TableCell>
                                </TableRow>
                            ) : (
                                transactions.map((t) => (
                                    <TableRow key={t.id}>
                                        <TableCell className="font-medium text-sm">
                                            {t.sellerName ?? "—"}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {t.productName}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm">
                                            {formatRWF(t.totalAmount)}
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="secondary"
                                                className={`text-xs ${statusColors[t.status] || ""}`}
                                            >
                                                {t.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right text-xs text-muted-foreground">
                                            {new Date(
                                                t.createdAt,
                                            ).toLocaleDateString()}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                )}

                {/* Imports tab */}
                {tab === "imports" && (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Business</TableHead>
                                <TableHead>Product</TableHead>
                                <TableHead className="text-right">
                                    Qty
                                </TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">
                                    Date
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {imports.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={5}
                                        className="text-center text-sm text-muted-foreground py-8"
                                    >
                                        No recent imports
                                    </TableCell>
                                </TableRow>
                            ) : (
                                imports.map((i) => (
                                    <TableRow key={i.id}>
                                        <TableCell className="font-medium text-sm">
                                            {i.businessName ?? "—"}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {i.productName}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm">
                                            {(i.actualQuantity ?? i.expectedQuantity).toLocaleString()}
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="secondary"
                                                className={`text-xs ${statusColors[i.status] || ""}`}
                                            >
                                                {i.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right text-xs text-muted-foreground">
                                            {new Date(
                                                i.createdAt,
                                            ).toLocaleDateString()}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                )}

                {/* Disputes tab */}
                {tab === "disputes" && (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Reference</TableHead>
                                <TableHead>Filed By</TableHead>
                                <TableHead>Reason</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">
                                    Date
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {disputes.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={5}
                                        className="text-center text-sm text-muted-foreground py-8"
                                    >
                                        No recent disputes
                                    </TableCell>
                                </TableRow>
                            ) : (
                                disputes.map((d) => (
                                    <TableRow key={d.id}>
                                        <TableCell className="font-mono text-sm font-semibold">
                                            {d.referenceNumber}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {d.filedByName ?? "—"}
                                        </TableCell>
                                        <TableCell className="max-w-[150px] truncate text-sm">
                                            {d.reason}
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="secondary"
                                                className={`text-xs ${statusColors[d.status] || ""}`}
                                            >
                                                {d.status.replace("_", " ")}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right text-xs text-muted-foreground">
                                            {new Date(
                                                d.createdAt,
                                            ).toLocaleDateString()}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                )}

                {/* Audit tab */}
                {tab === "audit" && (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Action</TableHead>
                                <TableHead>User</TableHead>
                                <TableHead>Target</TableHead>
                                <TableHead className="text-right">
                                    Time
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {audit.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={4}
                                        className="text-center text-sm text-muted-foreground py-8"
                                    >
                                        No recent audit logs
                                    </TableCell>
                                </TableRow>
                            ) : (
                                audit.map((a) => (
                                    <TableRow key={a.id}>
                                        <TableCell className="text-sm font-medium">
                                            {formatAction(a.action)}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {a.userName ?? "System"}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground font-mono">
                                            {a.targetType && a.targetId
                                                ? `${a.targetType}:${a.targetId.slice(0, 8)}`
                                                : "—"}
                                        </TableCell>
                                        <TableCell className="text-right text-xs text-muted-foreground">
                                            {new Date(
                                                a.createdAt,
                                            ).toLocaleDateString()}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}
