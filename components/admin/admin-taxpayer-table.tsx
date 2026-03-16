"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Users,
    ChevronLeft,
    ChevronRight,
    ArrowUpDown,
    CheckCircle,
    XCircle,
} from "lucide-react";
import Link from "next/link";
import { formatRWF } from "@/components/dashboard/stat-card/stat-card";
import {
    getTaxpayerOverview,
    type TaxpayerRow,
    type TaxpayerSort,
} from "@/lib/actions/admin-taxpayer-overview.action";

interface AdminTaxpayerTableProps {
    initialRows: TaxpayerRow[];
    initialPagination: {
        page: number;
        totalPages: number;
        totalRows: number;
        pageSize: number;
    };
    initialSummary: {
        compliant: number;
        nonCompliant: number;
        totalOutstanding: number;
    };
}

const SORT_OPTIONS: { key: TaxpayerSort; label: string }[] = [
    { key: "name", label: "Name" },
    { key: "vat_generated", label: "VAT Generated" },
    { key: "compliance", label: "Compliance" },
    { key: "outstanding", label: "Outstanding" },
];

const roleColors: Record<string, string> = {
    manufacturer: "bg-blue-500/10 text-blue-600 border-blue-200",
    wholesaler: "bg-amber-500/10 text-amber-600 border-amber-200",
    retailer: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
};

export function AdminTaxpayerTable({
    initialRows,
    initialPagination,
    initialSummary,
}: AdminTaxpayerTableProps) {
    const [rows, setRows] = useState(initialRows);
    const [pagination, setPagination] = useState(initialPagination);
    const [summary, setSummary] = useState(initialSummary);
    const [sortBy, setSortBy] = useState<TaxpayerSort>("name");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
    const [isPending, startTransition] = useTransition();

    function loadPage(page: number, sort?: TaxpayerSort, dir?: "asc" | "desc") {
        const s = sort ?? sortBy;
        const d = dir ?? sortDir;
        startTransition(async () => {
            const data = await getTaxpayerOverview(page, s, d);
            setRows(data.rows);
            setPagination(data.pagination);
            setSummary(data.summary);
        });
    }

    function toggleSort(col: TaxpayerSort) {
        const newDir = sortBy === col && sortDir === "asc" ? "desc" : "asc";
        setSortBy(col);
        setSortDir(newDir);
        loadPage(1, col, newDir);
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Taxpayer Overview
                    </CardTitle>
                    <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1 text-emerald-600">
                            <CheckCircle className="h-3 w-3" />
                            {summary.compliant} compliant
                        </span>
                        <span className="flex items-center gap-1 text-red-600">
                            <XCircle className="h-3 w-3" />
                            {summary.nonCompliant} non-compliant
                        </span>
                        <span className="text-muted-foreground">
                            {formatRWF(summary.totalOutstanding)} outstanding
                        </span>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[100px]">TIN</TableHead>
                            <TableHead>
                                <button
                                    onClick={() => toggleSort("name")}
                                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                                >
                                    Name
                                    <ArrowUpDown className="h-3 w-3" />
                                </button>
                            </TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-right">
                                <button
                                    onClick={() => toggleSort("vat_generated")}
                                    className="flex items-center gap-1 ml-auto hover:text-foreground transition-colors"
                                >
                                    VAT Generated
                                    <ArrowUpDown className="h-3 w-3" />
                                </button>
                            </TableHead>
                            <TableHead className="text-right">
                                VAT Paid
                            </TableHead>
                            <TableHead className="text-right">
                                Net VAT Due
                            </TableHead>
                            <TableHead className="text-right">
                                <button
                                    onClick={() => toggleSort("compliance")}
                                    className="flex items-center gap-1 ml-auto hover:text-foreground transition-colors"
                                >
                                    Compliance
                                    <ArrowUpDown className="h-3 w-3" />
                                </button>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={7}
                                    className="text-center text-sm text-muted-foreground py-8"
                                >
                                    No traders found
                                </TableCell>
                            </TableRow>
                        ) : (
                            rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    className={
                                        isPending ? "opacity-50" : ""
                                    }
                                >
                                    <TableCell className="font-mono text-xs text-muted-foreground">
                                        {row.tinNumber ?? "—"}
                                    </TableCell>
                                    <TableCell className="font-medium text-sm">
                                        <Link
                                            href={`/admin/traders/${row.id}`}
                                            className="hover:underline"
                                        >
                                            {row.businessName ?? "—"}
                                        </Link>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant="outline"
                                            className={`text-[10px] capitalize ${roleColors[row.role ?? ""] ?? ""}`}
                                        >
                                            {row.role ?? "—"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-sm">
                                        {formatRWF(row.vatGenerated)}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-sm">
                                        {formatRWF(row.vatPaid)}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-sm">
                                        {formatRWF(row.netVatDue)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Badge
                                            variant="secondary"
                                            className={`text-xs ${row.isCompliant
                                                    ? "bg-emerald-500/10 text-emerald-600"
                                                    : "bg-red-500/10 text-red-600"
                                                }`}
                                        >
                                            {row.isCompliant
                                                ? "Compliant"
                                                : `Non-Compliant`}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                        <p className="text-xs text-muted-foreground">
                            Showing{" "}
                            {(pagination.page - 1) * pagination.pageSize + 1}–
                            {Math.min(
                                pagination.page * pagination.pageSize,
                                pagination.totalRows,
                            )}{" "}
                            of {pagination.totalRows}
                        </p>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                disabled={
                                    pagination.page <= 1 || isPending
                                }
                                onClick={() =>
                                    loadPage(pagination.page - 1)
                                }
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                            </Button>
                            {Array.from(
                                { length: Math.min(pagination.totalPages, 5) },
                                (_, i) => {
                                    // Show pages around current
                                    let pageNum: number;
                                    if (pagination.totalPages <= 5) {
                                        pageNum = i + 1;
                                    } else if (pagination.page <= 3) {
                                        pageNum = i + 1;
                                    } else if (
                                        pagination.page >=
                                        pagination.totalPages - 2
                                    ) {
                                        pageNum =
                                            pagination.totalPages - 4 + i;
                                    } else {
                                        pageNum = pagination.page - 2 + i;
                                    }
                                    return (
                                        <Button
                                            key={pageNum}
                                            variant={
                                                pageNum === pagination.page
                                                    ? "default"
                                                    : "outline"
                                            }
                                            size="icon"
                                            className="h-7 w-7 text-xs"
                                            disabled={isPending}
                                            onClick={() =>
                                                loadPage(pageNum)
                                            }
                                        >
                                            {pageNum}
                                        </Button>
                                    );
                                },
                            )}
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                disabled={
                                    pagination.page >=
                                    pagination.totalPages || isPending
                                }
                                onClick={() =>
                                    loadPage(pagination.page + 1)
                                }
                            >
                                <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
