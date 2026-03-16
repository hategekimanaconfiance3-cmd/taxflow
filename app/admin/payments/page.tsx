import { requireRRASession } from "@/lib/auth-guard";
import { getAllPayments, getPaymentSummary } from "@/lib/actions/admin-payment.action";
import { StatCard, formatRWF } from "@/components/dashboard/stat-card/stat-card";
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
    CreditCard,
    CheckCircle,
    Clock,
    XCircle,
    Banknote,
} from "lucide-react";
import { AdminPaymentActions } from "@/components/admin/admin-payment-actions";
import { ExportPaymentsCSV } from "@/components/admin/admin-export";

export default async function AdminPaymentsPage() {
    await requireRRASession("compliance_officer", "reporting_officer");

    const [payments, summary] = await Promise.all([
        getAllPayments(),
        getPaymentSummary(),
    ]);

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        Payments
                    </h1>
                    <p className="text-muted-foreground">
                        Track and manage all tax payments from traders.
                    </p>
                </div>
                {payments.length > 0 && <ExportPaymentsCSV rows={payments} />}
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Total Collected"
                    value={formatRWF(summary.totalCollected)}
                    description={`${summary.countConfirmed} confirmed payments`}
                    icon={<Banknote className="h-4 w-4" />}
                />
                <StatCard
                    title="Pending"
                    value={formatRWF(summary.totalPending)}
                    description={`${summary.countPending} awaiting review`}
                    icon={<Clock className="h-4 w-4" />}
                />
                <StatCard
                    title="Confirmed"
                    value={summary.countConfirmed}
                    description="Payments confirmed"
                    icon={<CheckCircle className="h-4 w-4" />}
                />
                <StatCard
                    title="Rejected"
                    value={summary.countRejected}
                    description="Payments rejected"
                    icon={<XCircle className="h-4 w-4" />}
                />
            </div>

            {/* Payments Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        All Payments ({payments.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {payments.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">
                            No payments recorded yet.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Trader</TableHead>
                                    <TableHead>TIN</TableHead>
                                    <TableHead className="text-right">
                                        Amount
                                    </TableHead>
                                    <TableHead>Method</TableHead>
                                    <TableHead>Reference</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">
                                        Date
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Actions
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {payments.map((p) => (
                                    <TableRow key={p.id}>
                                        <TableCell className="font-medium text-sm">
                                            {p.businessName ?? "—"}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs text-muted-foreground">
                                            {p.tinNumber ?? "—"}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-semibold">
                                            {formatRWF(p.amount)}
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="outline"
                                                className="text-xs capitalize"
                                            >
                                                {p.method.replace("_", " ")}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-xs font-mono text-muted-foreground">
                                            {p.reference ?? "—"}
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="secondary"
                                                className={`text-xs ${p.status === "confirmed"
                                                    ? "bg-emerald-500/10 text-emerald-600"
                                                    : p.status === "pending"
                                                        ? "bg-amber-500/10 text-amber-600"
                                                        : "bg-red-500/10 text-red-600"
                                                    }`}
                                            >
                                                {p.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right text-sm text-muted-foreground">
                                            {new Date(
                                                p.createdAt,
                                            ).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {p.status === "pending" && (
                                                <AdminPaymentActions
                                                    paymentId={p.id}
                                                />
                                            )}
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
