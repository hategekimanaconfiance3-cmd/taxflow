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
import { ArrowLeftRight } from "lucide-react";

interface Transaction {
    id: string;
    sellerName: string | null;
    sellerTin: string | null;
    productName: string;
    quantity: number;
    totalAmount: number;
    vatAmount: number;
    status: string;
    createdAt: Date;
}

interface PendingConfirmationsProps {
    transactions: Transaction[];
}

export function PendingConfirmations({
    transactions,
}: PendingConfirmationsProps) {
    if (transactions.length === 0) return null;

    return (
        <Card className="border-amber-200 bg-amber-50/50">
            <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <ArrowLeftRight className="h-4 w-4 text-amber-600" />
                    Pending Confirmations ({transactions.length})
                </CardTitle>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Seller TIN</TableHead>
                            <TableHead>Seller Name</TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {transactions.map((txn) => (
                            <TableRow key={txn.id}>
                                <TableCell className="font-mono text-sm text-muted-foreground">
                                    {txn.sellerTin ?? "—"}
                                </TableCell>
                                <TableCell className="font-medium">
                                    {txn.sellerName ?? "—"}
                                </TableCell>
                                <TableCell>{txn.productName}</TableCell>
                                <TableCell className="text-right font-mono">
                                    {txn.quantity.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                    {formatRWF(txn.totalAmount)}
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
    );
}
