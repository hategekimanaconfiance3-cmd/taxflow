import { requireTraderSession } from "@/lib/auth-guard";
import {
    getOutgoingTransactions,
    getIncomingTransactions,
} from "@/lib/actions/transaction.action";
import {
    getTaxComplianceStatus,
    getTaxPayments,
} from "@/lib/actions/compliance.action";
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
import { formatRWF } from "@/components/dashboard/stat-card/stat-card";
import {
    DollarSign,
    TrendingUp,
    Receipt,
    AlertTriangle,
    ShieldCheck,
} from "lucide-react";
import { TaxPaymentForm } from "@/components/dashboard/tax-payment-form";

export default async function PaymentsPage() {
    const session = await requireTraderSession();
    const [outgoing, incoming, compliance, payments] = await Promise.all([
        getOutgoingTransactions(),
        getIncomingTransactions(),
        getTaxComplianceStatus(),
        getTaxPayments(),
    ]);

    // Calculate VAT owed (on your sales) and VAT credit (on your purchases)
    const confirmedSales = outgoing.filter(
        (t) => t.status === "confirmed",
    );
    const confirmedPurchases = incoming.filter(
        (t) => t.status === "confirmed",
    );

    const vatCollected = confirmedSales.reduce(
        (sum, t) => sum + Number(t.vatAmount),
        0,
    );
    const vatPaid = confirmedPurchases.reduce(
        (sum, t) => sum + Number(t.vatAmount),
        0,
    );
    const netVat = vatCollected - vatPaid;
    const totalRevenue = confirmedSales.reduce(
        (sum, t) => sum + Number(t.totalAmount),
        0,
    );

    const stats = [
        {
            label: "Total Revenue",
            value: formatRWF(totalRevenue),
            icon: DollarSign,
            color: "text-emerald-500",
        },
        {
            label: "VAT Collected (Output)",
            value: formatRWF(vatCollected),
            icon: TrendingUp,
            color: "text-blue-500",
        },
        {
            label: "VAT Paid (Input)",
            value: formatRWF(vatPaid),
            icon: Receipt,
            color: "text-amber-500",
        },
        {
            label: "Net VAT Payable",
            value: formatRWF(Math.max(0, netVat)),
            icon: AlertTriangle,
            color: netVat > 0 ? "text-red-500" : "text-emerald-500",
        },
    ];

    // Merge all confirmed transactions for the ledger
    type LedgerEntry = {
        id: string;
        date: Date;
        direction: "collected" | "paid";
        counterparty: string;
        product: string;
        amount: number;
        vat: number;
    };

    const ledger: LedgerEntry[] = [
        ...confirmedSales.map((t) => ({
            id: t.id,
            date: t.createdAt,
            direction: "collected" as const,
            counterparty: t.buyerName ?? "—",
            product: t.productName,
            amount: Number(t.totalAmount),
            vat: Number(t.vatAmount),
        })),
        ...confirmedPurchases.map((t) => ({
            id: t.id,
            date: t.createdAt,
            direction: "paid" as const,
            counterparty: t.sellerName ?? "—",
            product: t.productName,
            amount: Number(t.totalAmount),
            vat: Number(t.vatAmount),
        })),
    ].sort(
        (a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    Payments & VAT
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Track VAT collected, paid, and net payable to RRA.
                </p>
            </div>

            {/* Compliance Status Banner */}
            <Card
                className={
                    compliance.isCompliant
                        ? "border-emerald-200/60 bg-emerald-50/30"
                        : "border-red-200/60 bg-red-50/30"
                }
            >
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div
                                className={`flex h-10 w-10 items-center justify-center rounded-full ${compliance.isCompliant
                                    ? "bg-emerald-100 text-emerald-600"
                                    : "bg-red-100 text-red-600"
                                    }`}
                            >
                                <ShieldCheck className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold">
                                    Tax Compliance Status
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {compliance.isCompliant
                                        ? "You are eligible to sell and purchase goods."
                                        : `You must pay at least ${compliance.threshold}% of your tax to trade. Pay your outstanding balance below.`}
                                </p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p
                                className={`text-2xl font-bold font-mono ${compliance.isCompliant
                                    ? "text-emerald-600"
                                    : "text-red-600"
                                    }`}
                            >
                                {compliance.compliancePct}%
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                                {compliance.outstanding > 0
                                    ? `Outstanding: ${compliance.outstanding.toLocaleString()} RWF`
                                    : "All paid up"}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Summary cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat) => (
                    <Card key={stat.label}>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <div
                                    className={`flex h-9 w-9 items-center justify-center rounded-lg bg-muted ${stat.color}`}
                                >
                                    <stat.icon className="h-4.5 w-4.5" />
                                </div>
                                <div>
                                    <p className="text-[12px] font-medium text-muted-foreground">
                                        {stat.label}
                                    </p>
                                    <p className="text-lg font-bold tracking-tight">
                                        {stat.value}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Tax Payment Form + VAT Summary side by side */}
            <div className="grid gap-4 lg:grid-cols-2">
                {/* Tax Payment Form */}
                <TaxPaymentForm outstanding={compliance.outstanding} />

                {/* VAT summary card */}
                <Card
                    className={
                        netVat > 0
                            ? "border-red-200/60"
                            : "border-emerald-200/60"
                    }
                >
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <Receipt className="h-4 w-4" />
                            VAT Summary
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                    Output VAT (Sales)
                                </span>
                                <span className="font-mono font-medium text-blue-600">
                                    {formatRWF(vatCollected)}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                    Input VAT (Purchases)
                                </span>
                                <span className="font-mono font-medium text-amber-600">
                                    − {formatRWF(vatPaid)}
                                </span>
                            </div>
                            <div className="border-t pt-3 flex justify-between">
                                <span className="font-semibold">
                                    Net Payable to RRA
                                </span>
                                <span
                                    className={`font-mono font-bold text-lg ${netVat > 0 ? "text-red-600" : "text-emerald-600"}`}
                                >
                                    {netVat > 0
                                        ? formatRWF(netVat)
                                        : `Credit: ${formatRWF(Math.abs(netVat))}`}
                                </span>
                            </div>
                            <div className="border-t pt-3 flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                    Total Payments Made
                                </span>
                                <span className="font-mono font-medium text-emerald-600">
                                    {formatRWF(compliance.totalPaid)}
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Payment History */}
            {payments.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Payment History
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Method</TableHead>
                                    <TableHead>Reference</TableHead>
                                    <TableHead className="text-right">
                                        Amount
                                    </TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {payments.map((p) => (
                                    <TableRow key={p.id}>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {new Date(
                                                p.createdAt,
                                            ).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell className="capitalize">
                                            {p.method.replace("_", " ")}
                                        </TableCell>
                                        <TableCell className="font-mono text-sm text-muted-foreground">
                                            {p.reference || "—"}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-medium text-emerald-600">
                                            {formatRWF(p.amount)}
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="secondary"
                                                className={
                                                    p.status === "confirmed"
                                                        ? "bg-emerald-500/10 text-emerald-600"
                                                        : p.status === "pending"
                                                            ? "bg-amber-500/10 text-amber-600"
                                                            : "bg-red-500/10 text-red-600"
                                                }
                                            >
                                                {p.status}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {/* VAT Ledger */}
            {ledger.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            VAT Ledger
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Counterparty</TableHead>
                                    <TableHead>Product</TableHead>
                                    <TableHead className="text-right">
                                        Amount
                                    </TableHead>
                                    <TableHead className="text-right">
                                        VAT
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {ledger.map((entry) => (
                                    <TableRow key={entry.id}>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {new Date(
                                                entry.date,
                                            ).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="secondary"
                                                className={
                                                    entry.direction ===
                                                        "collected"
                                                        ? "bg-blue-500/10 text-blue-600"
                                                        : "bg-amber-500/10 text-amber-600"
                                                }
                                            >
                                                {entry.direction ===
                                                    "collected"
                                                    ? "Output"
                                                    : "Input"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            {entry.counterparty}
                                        </TableCell>
                                        <TableCell>
                                            {entry.product}
                                        </TableCell>
                                        <TableCell className="text-right font-mono">
                                            {formatRWF(entry.amount)}
                                        </TableCell>
                                        <TableCell
                                            className={`text-right font-mono ${entry.direction ===
                                                "collected"
                                                ? "text-blue-600"
                                                : "text-amber-600"
                                                }`}
                                        >
                                            {entry.direction ===
                                                "collected"
                                                ? "+"
                                                : "−"}
                                            {formatRWF(entry.vat)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
