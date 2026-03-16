import { requireTraderSession } from "@/lib/auth-guard";
import {
    getOutgoingTransactions,
    getIncomingTransactions,
} from "@/lib/actions/transaction.action";
import { formatRWF } from "@/components/dashboard/stat-card/stat-card";
import { TransactionStatusBadge } from "@/components/dashboard/status-badges/status-badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { ArrowUpRight, ArrowDownLeft } from "lucide-react";

export default async function TransactionsPage() {
    const session = await requireTraderSession();
    const role = session.user.role;

    const [outgoing, incoming] = await Promise.all([
        getOutgoingTransactions(),
        getIncomingTransactions(),
    ]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    Transactions
                </h1>
                <p className="text-muted-foreground">
                    Track your sales and purchases across the supply chain.
                </p>
            </div>

            <Tabs defaultValue="outgoing" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="outgoing" className="gap-2">
                        <ArrowUpRight className="h-3.5 w-3.5" />
                        Sales ({outgoing.length})
                    </TabsTrigger>
                    {role !== "retailer" ? null : null}
                    <TabsTrigger value="incoming" className="gap-2">
                        <ArrowDownLeft className="h-3.5 w-3.5" />
                        Purchases ({incoming.length})
                    </TabsTrigger>
                </TabsList>

                {/* Outgoing (sales) */}
                <TabsContent value="outgoing">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base font-semibold">
                                Outgoing Sales
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {outgoing.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-8 text-center">
                                    No sales recorded yet.
                                </p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Buyer</TableHead>
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
                                            <TableHead className="text-right">
                                                Date
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {outgoing.map((txn) => (
                                            <TableRow key={txn.id}>
                                                <TableCell className="font-medium">
                                                    {txn.buyerName ?? "—"}
                                                </TableCell>
                                                <TableCell>
                                                    {txn.productName}
                                                </TableCell>
                                                <TableCell className="text-right font-mono">
                                                    {txn.quantity}
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
                                                <TableCell className="text-right text-sm text-muted-foreground">
                                                    {new Date(
                                                        txn.createdAt,
                                                    ).toLocaleDateString()}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Incoming (purchases) */}
                <TabsContent value="incoming">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base font-semibold">
                                Incoming Purchases
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {incoming.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-8 text-center">
                                    No purchases yet.
                                </p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Seller</TableHead>
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
                                            <TableHead className="text-right">
                                                Date
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {incoming.map((txn) => (
                                            <TableRow key={txn.id}>
                                                <TableCell className="font-medium">
                                                    {txn.sellerName ?? "—"}
                                                </TableCell>
                                                <TableCell>
                                                    {txn.productName}
                                                </TableCell>
                                                <TableCell className="text-right font-mono">
                                                    {txn.quantity}
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
                                                <TableCell className="text-right text-sm text-muted-foreground">
                                                    {new Date(
                                                        txn.createdAt,
                                                    ).toLocaleDateString()}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
