import { Suspense } from "react";
import { requireRRASession } from "@/lib/auth-guard";
import { getAllTransactions } from "@/lib/actions/admin.action";
import { TransactionStatusBadge } from "@/components/dashboard/status-badges/status-badges";
import { AdminTransactionFilters } from "@/components/admin/admin-transaction-filters";
import { AdminTransactionActions } from "@/components/admin/admin-transaction-actions";
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
import { ArrowLeftRight } from "lucide-react";

export default async function TransactionsPage({
    searchParams,
}: {
    searchParams: Promise<{
        status?: string;
        dateFrom?: string;
        dateTo?: string;
        search?: string;
    }>;
}) {
    await requireRRASession("compliance_officer", "audit_officer");
    const params = await searchParams;

    const transactions = await getAllTransactions({
        status: params.status,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        search: params.search,
    });

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    Transactions
                </h1>
                <p className="text-muted-foreground">
                    View, filter, and manage all system transactions.
                </p>
            </div>

            {/* Filters */}
            <Suspense fallback={null}>
                <AdminTransactionFilters />
            </Suspense>

            {/* Results */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <ArrowLeftRight className="h-4 w-4" />
                        {transactions.length} Transaction
                        {transactions.length !== 1 ? "s" : ""}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {transactions.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">
                            No transactions match the current filters.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Product</TableHead>
                                        <TableHead>Seller</TableHead>
                                        <TableHead>Buyer</TableHead>
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
                                        <TableHead className="text-right">
                                            Date
                                        </TableHead>
                                        <TableHead className="w-10" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {transactions.map((txn) => (
                                        <TableRow key={txn.id}>
                                            <TableCell className="font-medium text-sm">
                                                {txn.productName}
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {txn.sellerName ?? "—"}
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {txn.buyerName ?? "—"}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-sm">
                                                {txn.quantity}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-sm">
                                                {formatRWF(txn.totalAmount)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-xs text-muted-foreground">
                                                {formatRWF(txn.vatAmount)}
                                            </TableCell>
                                            <TableCell>
                                                <TransactionStatusBadge
                                                    status={txn.status}
                                                />
                                            </TableCell>
                                            <TableCell className="text-right text-sm text-muted-foreground">
                                                {new Date(
                                                    txn.createdAt,
                                                ).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell>
                                                <AdminTransactionActions
                                                    transactionId={txn.id}
                                                    currentStatus={txn.status}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
