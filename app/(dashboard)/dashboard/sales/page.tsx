import { requireTraderSession } from "@/lib/auth-guard";
import {
    getOutgoingTransactions,
    getIncomingTransactions,
} from "@/lib/actions/transaction.action";
import { formatRWF } from "@/components/dashboard/stat-card/stat-card";
import { TransactionStatusBadge } from "@/components/dashboard/status-badges/status-badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { History } from "lucide-react";

export default async function SalesHistoryPage() {
    const session = await requireTraderSession();
    const role = session.user.role;

    // Get both directions of transactions
    const [outgoing, incoming] = await Promise.all([
        getOutgoingTransactions(),
        getIncomingTransactions(),
    ]);

    // Merge and sort by date (most recent first)
    const allTransactions = [
        ...outgoing.map((t) => ({
            ...t,
            direction: "sold" as const,
            counterparty: t.buyerName ?? "Consumer",
            counterpartyTin: t.buyerTin,
        })),
        ...incoming
            .filter((t) => t.status !== "pending")
            .map((t) => ({
                ...t,
                direction: "purchased" as const,
                counterparty: t.sellerName ?? "—",
                counterpartyTin: t.sellerTin,
                confirmedAt: null as Date | null,
            })),
    ].sort(
        (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const completedCount = allTransactions.filter(
        (t) => t.status === "confirmed" || t.status === "completed",
    ).length;
    const totalValue = allTransactions
        .filter(
            (t) =>
                t.direction === "sold" &&
                (t.status === "confirmed" || t.status === "completed"),
        )
        .reduce((sum, t) => sum + t.totalAmount, 0);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    Sales History
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Complete history of all your transactions.
                </p>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                    <CardContent className="pt-4 pb-4">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">
                            Total Transactions
                        </p>
                        <p className="text-2xl font-bold mt-1">
                            {allTransactions.length}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 pb-4">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">
                            Completed
                        </p>
                        <p className="text-2xl font-bold mt-1 text-emerald-600">
                            {completedCount}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 pb-4">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">
                            Total Sales Value
                        </p>
                        <p className="text-2xl font-bold mt-1">
                            {formatRWF(totalValue)}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Transaction table */}
            {allTransactions.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <History className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
                        <p className="text-sm font-medium">
                            No transactions yet
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Your transaction history will appear here.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <History className="h-4 w-4" />
                            All Transactions
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Counterparty</TableHead>
                                    <TableHead>TIN</TableHead>
                                    <TableHead>Product</TableHead>
                                    <TableHead className="text-right">
                                        Qty
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Amount
                                    </TableHead>
                                    <TableHead className="text-right">
                                        VAT
                                    </TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {allTransactions.map((txn) => (
                                    <TableRow key={txn.id}>
                                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                            {new Date(
                                                txn.createdAt,
                                            ).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell>
                                            <span
                                                className={`text-xs font-medium px-2 py-0.5 rounded-full ${txn.direction === "sold"
                                                        ? "bg-blue-50 text-blue-700"
                                                        : "bg-purple-50 text-purple-700"
                                                    }`}
                                            >
                                                {txn.direction === "sold"
                                                    ? "Sold"
                                                    : "Purchased"}
                                            </span>
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            {txn.counterparty}
                                        </TableCell>
                                        <TableCell className="font-mono text-sm text-muted-foreground">
                                            {txn.counterpartyTin ?? "—"}
                                        </TableCell>
                                        <TableCell>
                                            {txn.productName}
                                        </TableCell>
                                        <TableCell className="text-right font-mono">
                                            {txn.quantity.toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right font-mono">
                                            {formatRWF(txn.totalAmount)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-muted-foreground">
                                            {formatRWF(txn.vatAmount)}
                                        </TableCell>
                                        <TableCell>
                                            <TransactionStatusBadge
                                                status={txn.status}
                                            />
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
