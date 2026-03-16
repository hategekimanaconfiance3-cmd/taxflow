"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, Printer, Loader2 } from "lucide-react";
import { formatRWF } from "@/components/dashboard/stat-card/stat-card";

// ---------------------------------------------------------------------------
// CSV Export utility
// ---------------------------------------------------------------------------

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
    const csvContent = [
        headers.join(","),
        ...rows.map((row) =>
            row
                .map((cell) => {
                    // Escape cells containing commas or quotes
                    if (
                        cell.includes(",") ||
                        cell.includes('"') ||
                        cell.includes("\n")
                    ) {
                        return `"${cell.replace(/"/g, '""')}"`;
                    }
                    return cell;
                })
                .join(","),
        ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Taxpayer Overview Export
// ---------------------------------------------------------------------------

interface TaxpayerRow {
    id: string;
    tinNumber: string | null;
    businessName: string | null;
    role: string | null;
    vatGenerated: number;
    vatPaid: number;
    netVatDue: number;
    totalPayments: number;
    outstanding: number;
    compliancePct: number;
    isCompliant: boolean;
}

export function ExportTaxpayerCSV({ rows }: { rows: TaxpayerRow[] }) {
    const [exporting, setExporting] = useState(false);

    function handleExport() {
        setExporting(true);
        const headers = [
            "TIN",
            "Business Name",
            "Category",
            "VAT Generated (RWF)",
            "VAT Paid (RWF)",
            "Net VAT Due (RWF)",
            "Total Payments (RWF)",
            "Outstanding (RWF)",
            "Compliance %",
            "Status",
        ];
        const csvRows = rows.map((r) => [
            r.tinNumber ?? "",
            r.businessName ?? "",
            r.role ?? "",
            String(r.vatGenerated),
            String(r.vatPaid),
            String(r.netVatDue),
            String(r.totalPayments),
            String(r.outstanding),
            String(r.compliancePct),
            r.isCompliant ? "Compliant" : "Non-Compliant",
        ]);

        const date = new Date().toISOString().split("T")[0];
        downloadCSV(`taxpayer-overview-${date}.csv`, headers, csvRows);
        setTimeout(() => setExporting(false), 500);
    }

    return (
        <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleExport}
            disabled={exporting}
        >
            {exporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
                <Download className="h-3.5 w-3.5" />
            )}
            Export CSV
        </Button>
    );
}

// ---------------------------------------------------------------------------
// Generic Export Dropdown (for pages with multiple export options)
// ---------------------------------------------------------------------------

export function ExportDropdown({
    onExportCSV,
    onPrint,
}: {
    onExportCSV?: () => void;
    onPrint?: () => void;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <Download className="h-3.5 w-3.5" />
                    Export
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {onExportCSV && (
                    <DropdownMenuItem onClick={onExportCSV}>
                        <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
                        Export as CSV
                    </DropdownMenuItem>
                )}
                {onPrint && (
                    <DropdownMenuItem onClick={onPrint}>
                        <Printer className="mr-2 h-3.5 w-3.5" />
                        Print / Save as PDF
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

// ---------------------------------------------------------------------------
// Payments Export
// ---------------------------------------------------------------------------

interface PaymentRow {
    id: string;
    businessName: string | null;
    amount: number;
    method: string | null;
    reference: string | null;
    status: string;
    createdAt: string | Date;
}

export function ExportPaymentsCSV({ rows }: { rows: PaymentRow[] }) {
    const [exporting, setExporting] = useState(false);

    function handleExport() {
        setExporting(true);
        const headers = ["ID", "Business", "Amount (RWF)", "Method", "Reference", "Status", "Date"];
        const csvRows = rows.map((r) => [
            r.id,
            r.businessName ?? "",
            String(r.amount),
            r.method ?? "",
            r.reference ?? "",
            r.status,
            new Date(r.createdAt).toLocaleDateString(),
        ]);
        downloadCSV(`payments-${new Date().toISOString().split("T")[0]}.csv`, headers, csvRows);
        setTimeout(() => setExporting(false), 500);
    }

    return (
        <Button variant="outline" size="sm" className="gap-2" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export CSV
        </Button>
    );
}

// ---------------------------------------------------------------------------
// Audit Logs Export
// ---------------------------------------------------------------------------

interface AuditRow {
    id: string;
    userName: string;
    businessName: string | null;
    action: string;
    targetType: string | null;
    targetId: string | null;
    metadata: string | null;
    createdAt: string | Date;
}

export function ExportAuditCSV({ rows }: { rows: AuditRow[] }) {
    const [exporting, setExporting] = useState(false);

    function handleExport() {
        setExporting(true);
        const headers = ["Timestamp", "User", "Business", "Action", "Target Type", "Target ID", "Details"];
        const csvRows = rows.map((r) => [
            new Date(r.createdAt).toISOString(),
            r.userName,
            r.businessName ?? "",
            r.action,
            r.targetType ?? "",
            r.targetId ?? "",
            r.metadata ?? "",
        ]);
        downloadCSV(`audit-log-${new Date().toISOString().split("T")[0]}.csv`, headers, csvRows);
        setTimeout(() => setExporting(false), 500);
    }

    return (
        <Button variant="outline" size="sm" className="gap-2" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export Audit Log
        </Button>
    );
}

// ---------------------------------------------------------------------------
// VAT Monthly Summary Export
// ---------------------------------------------------------------------------

interface VATMonthRow {
    month: string;
    generated: number;
    paid: number;
    net: number;
}

export function ExportVATMonthlyCSV({ rows }: { rows: VATMonthRow[] }) {
    const [exporting, setExporting] = useState(false);

    function handleExport() {
        setExporting(true);
        const headers = ["Month", "VAT Generated (RWF)", "VAT Paid (RWF)", "Net (RWF)"];
        const csvRows = rows.map((r) => [
            r.month,
            String(r.generated),
            String(r.paid),
            String(r.net),
        ]);
        downloadCSV(`vat-monthly-${new Date().toISOString().split("T")[0]}.csv`, headers, csvRows);
        setTimeout(() => setExporting(false), 500);
    }

    return (
        <Button variant="outline" size="sm" className="gap-2" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export CSV
        </Button>
    );
}

