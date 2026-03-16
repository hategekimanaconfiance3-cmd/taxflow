import { requireRRASession } from "@/lib/auth-guard";
import { getTraderTaxReport } from "@/lib/actions/admin-report.action";
import { getTrader } from "@/lib/actions/admin.action";
import { formatRWF } from "@/components/dashboard/stat-card/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
    TrendingUp,
    TrendingDown,
    Calculator,
    CreditCard,
    ArrowLeft,
    CheckCircle,
    AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintReportButton } from "@/components/admin/print-report-button";

export default async function TraderReportPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    await requireRRASession("reporting_officer");
    const { id } = await params;

    const [trader, report] = await Promise.all([
        getTrader(id),
        getTraderTaxReport(id),
    ]);

    if (!trader || !report) notFound();

    const complianceOk = report.compliancePct >= 95;

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* ── Header ────────────────────────────────── */}
            <div className="flex items-start justify-between">
                <div>
                    <Link
                        href="/admin/reports"
                        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Back to Reports
                    </Link>
                    <h1 className="text-2xl font-bold tracking-tight">
                        Tax Report
                    </h1>
                    <p className="text-muted-foreground">
                        {trader.businessName ?? trader.name} — TIN:{" "}
                        {trader.tinNumber}
                    </p>
                </div>
                <PrintReportButton />
            </div>

            {/* ── Official Header (prints nicely) ───────── */}
            <Card className="print:border-0 print:shadow-none" id="report-content">
                <CardContent className="pt-6">
                    <div className="text-center border-b pb-4 mb-6">
                        <h2 className="text-lg font-bold">
                            REPUBLIC OF RWANDA
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            Rwanda Revenue Authority — TaxFlow System
                        </p>
                        <p className="text-base font-semibold mt-2">
                            VAT RETURN & TAX COMPLIANCE REPORT
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Generated:{" "}
                            {new Date().toLocaleDateString("en-RW", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                            })}
                        </p>
                    </div>

                    {/* ── Trader Info ───────────────── */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div>
                            <p className="text-xs text-muted-foreground">
                                Business Name
                            </p>
                            <p className="font-semibold text-sm">
                                {trader.businessName ?? "—"}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">TIN</p>
                            <p className="font-mono font-semibold text-sm">
                                {trader.tinNumber}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">
                                Category
                            </p>
                            <p className="capitalize font-semibold text-sm">
                                {trader.role}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">
                                Compliance
                            </p>
                            <Badge
                                variant="secondary"
                                className={
                                    complianceOk
                                        ? "bg-emerald-500/10 text-emerald-600"
                                        : "bg-red-500/10 text-red-600"
                                }
                            >
                                {complianceOk ? (
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                ) : (
                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                )}
                                {report.compliancePct}%
                            </Badge>
                        </div>
                    </div>

                    <Separator className="my-6" />

                    {/* ── Summary Cards ─────────────── */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <Card>
                            <CardContent className="pt-4 pb-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <TrendingUp className="h-4 w-4 text-blue-500" />
                                    <p className="text-xs text-muted-foreground">
                                        Output VAT
                                    </p>
                                </div>
                                <p className="text-lg font-bold font-mono">
                                    {formatRWF(report.vatOutput)}
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-4 pb-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <TrendingDown className="h-4 w-4 text-violet-500" />
                                    <p className="text-xs text-muted-foreground">
                                        Input VAT
                                    </p>
                                </div>
                                <p className="text-lg font-bold font-mono">
                                    {formatRWF(report.vatInput)}
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-4 pb-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <Calculator className="h-4 w-4 text-amber-500" />
                                    <p className="text-xs text-muted-foreground">
                                        Net VAT Due
                                    </p>
                                </div>
                                <p className="text-lg font-bold font-mono">
                                    {formatRWF(report.netVatDue)}
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-4 pb-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <CreditCard className="h-4 w-4 text-emerald-500" />
                                    <p className="text-xs text-muted-foreground">
                                        Total Paid
                                    </p>
                                </div>
                                <p className="text-lg font-bold font-mono text-emerald-600">
                                    {formatRWF(report.totalPaid)}
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* ── Detailed Breakdown ──────────── */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-semibold">
                                VAT Breakdown
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Item</TableHead>
                                        <TableHead className="text-right">
                                            Amount (RWF)
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow>
                                        <TableCell>
                                            Output VAT (Sales Tax Collected)
                                        </TableCell>
                                        <TableCell className="text-right font-mono">
                                            {formatRWF(report.vatOutput)}
                                        </TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell>
                                            Input VAT (Purchase Tax Paid)
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-muted-foreground">
                                            -{formatRWF(report.vatInput)}
                                        </TableCell>
                                    </TableRow>
                                    <TableRow className="font-semibold border-t-2">
                                        <TableCell>Net VAT Due</TableCell>
                                        <TableCell className="text-right font-mono">
                                            {formatRWF(report.netVatDue)}
                                        </TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell>
                                            Payments Made (Confirmed)
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-emerald-600">
                                            -{formatRWF(report.totalPaid)}
                                        </TableCell>
                                    </TableRow>
                                    <TableRow className="font-bold border-t-2">
                                        <TableCell>
                                            Outstanding Balance
                                        </TableCell>
                                        <TableCell
                                            className={`text-right font-mono ${report.outstanding > 0
                                                ? "text-red-600"
                                                : "text-emerald-600"
                                                }`}
                                        >
                                            {formatRWF(report.outstanding)}
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {/* ── Transaction Activity ──────────── */}
                    <div className="grid grid-cols-2 gap-4 mt-6">
                        <Card>
                            <CardContent className="pt-4 pb-3">
                                <p className="text-xs text-muted-foreground mb-1">
                                    Total Transactions
                                </p>
                                <p className="text-2xl font-bold">
                                    {report.transactions.count}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Total Value:{" "}
                                    {formatRWF(report.transactions.totalValue)}
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-4 pb-3">
                                <p className="text-xs text-muted-foreground mb-1">
                                    Payments Made
                                </p>
                                <p className="text-2xl font-bold">
                                    {report.paymentCount}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Total Paid: {formatRWF(report.totalPaid)}
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* ── Footer ────────────────────── */}
                    <div className="border-t mt-8 pt-4 text-center text-xs text-muted-foreground">
                        <p>
                            This report is system-generated by RRA TaxFlow.
                        </p>
                        <p>
                            Report ID: {id.slice(0, 8)} | Date:{" "}
                            {new Date().toISOString().split("T")[0]}
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
