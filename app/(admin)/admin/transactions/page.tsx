import { requireRRASession } from '@/lib/auth-guard';
import { getAllTransactions } from '@/lib/actions/admin.action';
import { AdminTransactionActions } from '@/components/admin/admin-transaction-actions';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';
import { ArrowLeftRight } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-blue-100 text-blue-700',
  pending: 'bg-amber-100 text-amber-700',
  rejected: 'bg-red-100 text-red-700',
  expired: 'bg-zinc-100 text-zinc-600',
};

export default async function AdminTransactionsPage() {
  await requireRRASession();

  const transactions = await getAllTransactions();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
        <p className="text-muted-foreground text-sm mt-1">
          All system-wide transactions across all traders.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4" />
            All Transactions ({transactions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Seller</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">VAT</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground text-sm">
                    No transactions found.
                  </TableCell>
                </TableRow>
              )}
              {transactions.map((txn) => (
                <TableRow key={txn.id}>
                  <TableCell className="font-medium text-xs">{txn.sellerName}</TableCell>
                  <TableCell className="text-xs">{txn.buyerName ?? '—'}</TableCell>
                  <TableCell className="text-xs">{txn.productName}</TableCell>
                  <TableCell className="text-right text-xs">{txn.quantity?.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatRWF(Number(txn.totalAmount))}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {formatRWF(Number(txn.vatAmount))}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] capitalize ${STATUS_COLORS[txn.status] ?? ''}`}
                    >
                      {txn.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {txn.createdAt ? new Date(txn.createdAt).toLocaleDateString() : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <AdminTransactionActions transactionId={txn.id} currentStatus={txn.status} />
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
