"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { FileText, Loader2, Download, Printer } from "lucide-react";
import { getTraderTaxReport } from "@/lib/actions/admin-report.action";
import { formatRWF } from "@/components/dashboard/stat-card/stat-card";

interface Trader {
    id: string;
    businessName: string | null;
    tinNumber: string | null;
}

type ReportData = Awaited<ReturnType<typeof getTraderTaxReport>>;

export function VATReturnDialog({ traders }: { traders: Trader[] }) {
    const [open, setOpen] = useState(false);
    const [selectedTrader, setSelectedTrader] = useState("");
    const [report, setReport] = useState<ReportData>(null);
    const [isPending, startTransition] = useTransition();

    function handleGenerate() {
        if (!selectedTrader) return;
        startTransition(async () => {
            const data = await getTraderTaxReport(selectedTrader);
            setReport(data);
        });
    }

    function handleClose() {
        setOpen(false);
        setSelectedTrader("");
        setReport(null);
    }

    function handlePrint() {
        window.print();
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => (v ? setOpen(true) : handleClose())}
        >
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <FileText className="h-3.5 w-3.5" />
                    Generate VAT Return
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Generate VAT Return</DialogTitle>
                </DialogHeader>

                {!report ? (
                    <>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Select Trader</Label>
                                <Select
                                    value={selectedTrader}
                                    onValueChange={setSelectedTrader}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Choose a trader..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {traders.map((t) => (
                                            <SelectItem
                                                key={t.id}
                                                value={t.id}
                                            >
                                                {t.businessName ?? "Unknown"} —{" "}
                                                {t.tinNumber}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={handleClose}
                                disabled={isPending}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleGenerate}
                                disabled={isPending || !selectedTrader}
                                className="gap-2"
                            >
                                {isPending ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <FileText className="h-3.5 w-3.5" />
                                )}
                                Generate
                            </Button>
                        </DialogFooter>
                    </>
                ) : (
                    /* ── VAT Return Report ──────────────────── */
                    <div className="space-y-4 print:text-black" id="vat-return-report">
                        {/* Header */}
                        <div className="text-center border-b pb-3">
                            <h2 className="text-lg font-bold">
                                REPUBLIC OF RWANDA
                            </h2>
                            <p className="text-xs text-muted-foreground">
                                Rwanda Revenue Authority
                            </p>
                            <p className="text-sm font-semibold mt-1">
                                VAT RETURN STATEMENT
                            </p>
                        </div>

                        {/* Trader Info */}
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                                <span className="text-muted-foreground text-xs">
                                    Business Name
                                </span>
                                <p className="font-medium">
                                    {report.trader.businessName ?? "—"}
                                </p>
                            </div>
                            <div>
                                <span className="text-muted-foreground text-xs">
                                    TIN
                                </span>
                                <p className="font-mono font-medium">
                                    {report.trader.tinNumber}
                                </p>
                            </div>
                            <div>
                                <span className="text-muted-foreground text-xs">
                                    Category
                                </span>
                                <p className="capitalize font-medium">
                                    {report.trader.role}
                                </p>
                            </div>
                            <div>
                                <span className="text-muted-foreground text-xs">
                                    Date
                                </span>
                                <p className="font-medium">
                                    {new Date().toLocaleDateString("en-RW")}
                                </p>
                            </div>
                        </div>

                        <Separator />

                        {/* VAT Breakdown */}
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                    Output VAT (Sales)
                                </span>
                                <span className="font-mono font-semibold">
                                    {formatRWF(report.vatOutput)}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                    Input VAT (Purchases)
                                </span>
                                <span className="font-mono font-semibold text-muted-foreground">
                                    -{formatRWF(report.vatInput)}
                                </span>
                            </div>
                            <Separator />
                            <div className="flex justify-between text-sm font-semibold">
                                <span>Net VAT Due</span>
                                <span className="font-mono">
                                    {formatRWF(report.netVatDue)}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                    Total Paid
                                </span>
                                <span className="font-mono text-emerald-600">
                                    -{formatRWF(report.totalPaid)}
                                </span>
                            </div>
                            <Separator />
                            <div className="flex justify-between text-sm font-bold">
                                <span>Outstanding Balance</span>
                                <span
                                    className={`font-mono ${report.outstanding > 0 ? "text-red-600" : "text-emerald-600"}`}
                                >
                                    {formatRWF(report.outstanding)}
                                </span>
                            </div>
                        </div>

                        <Separator />

                        {/* Compliance */}
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">
                                Compliance
                            </span>
                            <Badge
                                variant="secondary"
                                className={`text-xs ${report.compliancePct >= 95
                                        ? "bg-emerald-500/10 text-emerald-600"
                                        : "bg-red-500/10 text-red-600"
                                    }`}
                            >
                                {report.compliancePct}%
                            </Badge>
                        </div>

                        {/* Summary */}
                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                            <div>
                                Transactions: {report.transactions.count} (
                                {formatRWF(report.transactions.totalValue)})
                            </div>
                            <div>Payments: {report.paymentCount}</div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 print:hidden">
                            <Button
                                variant="outline"
                                className="flex-1 gap-2"
                                onClick={handlePrint}
                            >
                                <Printer className="h-3.5 w-3.5" />
                                Print
                            </Button>
                            <Button
                                className="flex-1 gap-2"
                                onClick={handleClose}
                            >
                                Done
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
