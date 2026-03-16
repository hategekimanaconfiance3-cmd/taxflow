import { requireRRASession } from "@/lib/auth-guard";
import { getVATSummaryByMonth } from "@/lib/actions/admin-report.action";
import { getSystemVAT } from "@/lib/actions/vat.action";
import { getAllTraders } from "@/lib/actions/admin.action";
import { StatCard, formatRWF } from "@/components/dashboard/stat-card/stat-card";
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
import { ExportVATMonthlyCSV } from "@/components/admin/admin-export";
import Link from "next/link";
import {
    FileBarChart,
    TrendingUp,
    TrendingDown,
    Calculator,
    Receipt,
    ExternalLink,
} from "lucide-react";

export default async function AdminReportsPage() {
    await requireRRASession("reporting_officer");

    const [systemVat, monthlyData, traders] = await Promise.all([
        getSystemVAT(),
        getVATSummaryByMonth(),
        getAllTraders(),
    ]);

    const totalGenerated = monthlyData.reduce((s, m) => s + m.generated, 0);
    const totalPaid = monthlyData.reduce((s, m) => s + m.paid, 0);

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        Tax Reports
                    </h1>
                    <p className="text-muted-foreground">
                        System-wide VAT and tax reporting.
                    </p>
                </div>
                {monthlyData.length > 0 && <ExportVATMonthlyCSV rows={monthlyData} />}
            </div>

            {/* Summary */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Total VAT Generated"
                    value={formatRWF(systemVat.totalVatGenerated)}
                    description="All output VAT"
                    icon={<TrendingUp className="h-4 w-4" />}
                />
                <StatCard
                    title="Total VAT Paid (Input)"
                    value={formatRWF(systemVat.totalVatPaid)}
                    description="All input VAT claimed"
                    icon={<TrendingDown className="h-4 w-4" />}
                />
                <StatCard
                    title="Net VAT Due"
                    value={formatRWF(systemVat.netVatDue)}
                    description="System balance"
                    icon={<Calculator className="h-4 w-4" />}
                />
                <StatCard
                    title="Active Businesses"
                    value={systemVat.totalBusinesses}
                    description="In the supply chain"
                    icon={<Receipt className="h-4 w-4" />}
                />
            </div>

            {/* Monthly VAT Breakdown */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <FileBarChart className="h-4 w-4" />
                        Monthly VAT Summary
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {monthlyData.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">
                            No VAT records yet.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Period</TableHead>
                                    <TableHead className="text-right">
                                        VAT Generated
                                    </TableHead>
                                    <TableHead className="text-right">
                                        VAT Paid (Input)
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Net VAT Due
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {monthlyData.map((m) => (
                                    <TableRow key={m.month}>
                                        <TableCell className="font-medium">
                                            {m.month}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm">
                                            {formatRWF(m.generated)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm text-muted-foreground">
                                            {formatRWF(m.paid)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm font-semibold">
                                            {formatRWF(m.net)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {/* Totals row */}
                                <TableRow className="bg-muted/50 font-semibold">
                                    <TableCell>Total</TableCell>
                                    <TableCell className="text-right font-mono text-sm">
                                        {formatRWF(totalGenerated)}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-sm">
                                        {formatRWF(totalPaid)}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-sm">
                                        {formatRWF(totalGenerated - totalPaid)}
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Per-Trader Reports */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold">
                        Per-Trader Reports
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Business</TableHead>
                                <TableHead>TIN</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {traders.slice(0, 20).map((t) => (
                                <TableRow key={t.id}>
                                    <TableCell className="font-medium text-sm">
                                        {t.businessName ?? t.name}
                                    </TableCell>
                                    <TableCell className="font-mono text-sm text-muted-foreground">
                                        {t.tinNumber}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="text-[10px] capitalize">
                                            {t.role}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Link
                                            href={`/admin/reports/${t.id}`}
                                            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                                        >
                                            View Report
                                            <ExternalLink className="h-3 w-3" />
                                        </Link>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
