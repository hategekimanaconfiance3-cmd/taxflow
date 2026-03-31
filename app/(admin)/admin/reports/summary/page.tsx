import { requireRRASession } from "@/lib/auth-guard";
import { generateComplianceSummary } from "@/lib/actions/admin-scheduled-reports.action";
import { formatRWF } from "@/components/dashboard/stat-card/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
    Users, DollarSign, ArrowRightLeft, Scale, AlertTriangle, FileText,
} from "lucide-react";

export default async function SummaryReportPage() {
    await requireRRASession("super_admin", "compliance_officer", "reporting_officer");
    const report = await generateComplianceSummary();

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        Compliance Summary Report
                    </h1>
                    <p className="text-muted-foreground">{report.period}</p>
                </div>
                <Badge variant="outline" className="text-xs">
                    <FileText className="h-3 w-3 mr-1" />
                    Generated: {report.generatedAt.toLocaleString()}
                </Badge>
            </div>

            {/* Key Metrics */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <Users className="h-8 w-8 text-blue-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">Trader Compliance</p>
                            <p className="text-2xl font-bold">{report.traders.complianceRate}%</p>
                            <p className="text-xs text-muted-foreground">
                                {report.traders.compliant}/{report.traders.total} compliant
                            </p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <DollarSign className="h-8 w-8 text-green-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">Revenue Collected</p>
                            <p className="text-2xl font-bold">{report.revenue.collectionRate}%</p>
                            <p className="text-xs text-muted-foreground">
                                {formatRWF(report.revenue.totalCollected)} of {formatRWF(report.revenue.totalOwed)}
                            </p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <ArrowRightLeft className="h-8 w-8 text-purple-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">Transactions</p>
                            <p className="text-2xl font-bold">{report.transactions.totalCount.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">
                                {formatRWF(report.transactions.totalValue)} total value
                            </p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <Scale className="h-8 w-8 text-amber-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">Disputes Resolved</p>
                            <p className="text-2xl font-bold">{report.disputes.resolutionRate}%</p>
                            <p className="text-xs text-muted-foreground">
                                {report.disputes.resolved}/{report.disputes.total} resolved
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Detail Sections */}
            <div className="grid gap-4 md:grid-cols-2">
                {/* Revenue Breakdown */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base font-semibold">Revenue Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Total VAT Owed</span>
                            <span className="font-mono">{formatRWF(report.revenue.totalOwed)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Total Collected</span>
                            <span className="font-mono text-green-600">{formatRWF(report.revenue.totalCollected)}</span>
                        </div>
                        <div className="flex justify-between border-t pt-2">
                            <span className="font-medium">Outstanding</span>
                            <span className="font-mono font-bold text-red-600">{formatRWF(report.revenue.outstanding)}</span>
                        </div>
                    </CardContent>
                </Card>

                {/* Trader Breakdown */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base font-semibold">Trader Status</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Total Traders</span>
                            <span className="font-mono">{report.traders.total}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Compliant (≥95%)</span>
                            <span className="font-mono text-green-600">{report.traders.compliant}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Non-Compliant</span>
                            <span className="font-mono text-amber-600">{report.traders.nonCompliant}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Suspended</span>
                            <span className="font-mono text-red-600">{report.traders.suspended}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Anomalies (30d)</span>
                            <span className="font-mono">
                                {report.anomalyCount}
                                {report.anomalyCount > 0 && (
                                    <AlertTriangle className="inline h-3 w-3 ml-1 text-amber-500" />
                                )}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Top Arrears */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold">Top 10 Outstanding Arrears</CardTitle>
                </CardHeader>
                <CardContent>
                    {report.topArrears.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6">
                            No outstanding arrears.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>#</TableHead>
                                    <TableHead>Trader</TableHead>
                                    <TableHead className="text-right">Outstanding</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {report.topArrears.map((t, i) => (
                                    <TableRow key={i}>
                                        <TableCell className="font-mono text-muted-foreground">{i + 1}</TableCell>
                                        <TableCell className="font-medium">{t.traderName}</TableCell>
                                        <TableCell className="text-right font-mono font-medium text-red-600">
                                            {formatRWF(t.outstanding)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
