"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2, FileSpreadsheet, Shield, Users } from "lucide-react";
import {
    getNationalTaxData,
    getComplianceDataset,
} from "@/lib/actions/admin-data-export.action";

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
    const csvContent = [
        headers.join(","),
        ...rows.map((row) =>
            row
                .map((cell) =>
                    cell.includes(",") || cell.includes('"') || cell.includes("\n")
                        ? `"${cell.replace(/"/g, '""')}"`
                        : cell,
                )
                .join(","),
        ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// National Tax Data Export
// ---------------------------------------------------------------------------

export function ExportNationalData() {
    const [isPending, startTransition] = useTransition();

    function handleExport() {
        startTransition(async () => {
            const data = await getNationalTaxData();
            const headers = [
                "TIN",
                "Business Name",
                "Owner",
                "Category",
                "Phone",
                "Status",
                "Registered",
                "VAT Output (RWF)",
                "VAT Input (RWF)",
                "Net VAT Due (RWF)",
                "Total Paid (RWF)",
                "Outstanding (RWF)",
                "Compliance %",
                "Transactions",
                "Transaction Volume (RWF)",
                "Payments",
            ];
            const rows = data.map((t) => [
                t.tin,
                t.businessName,
                t.ownerName,
                t.role,
                t.phone,
                t.status,
                t.registeredAt,
                String(t.vatOutput),
                String(t.vatInput),
                String(t.netVatDue),
                String(t.totalPaid),
                String(t.outstanding),
                String(t.compliancePct),
                String(t.totalTransactions),
                String(t.transactionValue),
                String(t.paymentCount),
            ]);
            downloadCSV(
                `national-tax-data-${new Date().toISOString().split("T")[0]}.csv`,
                headers,
                rows,
            );
        });
    }

    return (
        <Button onClick={handleExport} disabled={isPending} className="gap-2 w-full justify-start h-auto py-4 px-5">
            {isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
                <FileSpreadsheet className="h-5 w-5" />
            )}
            <div className="text-left">
                <p className="font-semibold">National Tax Data</p>
                <p className="text-xs font-normal opacity-80">
                    Complete trader dataset with VAT, payments & compliance
                </p>
            </div>
        </Button>
    );
}

// ---------------------------------------------------------------------------
// Taxpayer Directory Export
// ---------------------------------------------------------------------------

export function ExportTaxpayerDirectory() {
    const [isPending, startTransition] = useTransition();

    function handleExport() {
        startTransition(async () => {
            const data = await getNationalTaxData();
            const headers = [
                "TIN",
                "Business Name",
                "Owner",
                "Category",
                "Phone",
                "Status",
                "Registered",
            ];
            const rows = data.map((t) => [
                t.tin,
                t.businessName,
                t.ownerName,
                t.role,
                t.phone,
                t.status,
                t.registeredAt,
            ]);
            downloadCSV(
                `taxpayer-directory-${new Date().toISOString().split("T")[0]}.csv`,
                headers,
                rows,
            );
        });
    }

    return (
        <Button
            variant="outline"
            onClick={handleExport}
            disabled={isPending}
            className="gap-2 w-full justify-start h-auto py-4 px-5"
        >
            {isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
                <Users className="h-5 w-5" />
            )}
            <div className="text-left">
                <p className="font-semibold">Taxpayer Directory</p>
                <p className="text-xs font-normal text-muted-foreground">
                    All registered traders with contact details
                </p>
            </div>
        </Button>
    );
}

// ---------------------------------------------------------------------------
// Compliance Dataset Export
// ---------------------------------------------------------------------------

export function ExportComplianceDataset() {
    const [isPending, startTransition] = useTransition();

    function handleExport() {
        startTransition(async () => {
            const data = await getComplianceDataset();
            const headers = [
                "TIN",
                "Business Name",
                "Category",
                "Status",
                "Net VAT Due (RWF)",
                "Total Paid (RWF)",
                "Outstanding (RWF)",
                "Compliance %",
                "Compliant",
                "Transaction Count",
                "Transaction Volume (RWF)",
                "Risk Level",
            ];
            const rows = data.map((t) => [
                t.tin,
                t.businessName,
                t.role,
                t.status,
                String(t.netVatDue),
                String(t.totalPaid),
                String(t.outstanding),
                String(t.compliancePct),
                t.isCompliant ? "Yes" : "No",
                String(t.transactionCount),
                String(t.transactionVolume),
                t.riskLevel,
            ]);
            downloadCSV(
                `compliance-dataset-${new Date().toISOString().split("T")[0]}.csv`,
                headers,
                rows,
            );
        });
    }

    return (
        <Button
            variant="outline"
            onClick={handleExport}
            disabled={isPending}
            className="gap-2 w-full justify-start h-auto py-4 px-5"
        >
            {isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
                <Shield className="h-5 w-5" />
            )}
            <div className="text-left">
                <p className="font-semibold">Compliance Dataset</p>
                <p className="text-xs font-normal text-muted-foreground">
                    Risk analysis with compliance scores & risk levels
                </p>
            </div>
        </Button>
    );
}
