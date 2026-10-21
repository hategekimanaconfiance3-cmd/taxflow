import { requireTraderSession } from '@/lib/auth-guard';
import { getOutgoingTransactions, getIncomingTransactions } from '@/lib/actions/transaction.action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArrowLeftRight } from 'lucide-react';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';
import { PaymentStatusControl } from '@/components/dashboard/transactions/payment-status-control';

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-blue-100 text-blue-700',
  pending: 'bg-amber-100 text-amber-700',
  rejected: 'bg-red-100 text-red-700',
  expired: 'bg-zinc-100 text-zinc-600',
};

export default async function TransactionsPage() {
  await requireTraderSession();

  const [outgoing, incoming] = await Promise.all([
    getOutgoingTransactions(),
    getIncomingTransactions(),
  ]);

  // Merge and sort by date
  const allTransactions = [
    ...outgoing.map((t) => ({ ...t, direction: 'out' as const, counterparty: t.buyerName })),
    ...incoming.map((t) => ({ ...t, direction: 'in' as const, counterparty: t.sellerName })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">All Transactions</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Combined view of all incoming and outgoing transactions for your business.
        </p>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
          {incoming.length} incoming
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
          {outgoing.length} outgoing
        </span>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4" />
            Transactions ({allTransactions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Direction</TableHead>
                <TableHead>Counterparty</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Type / payment</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allTransactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                    No transactions yet.
                  </TableCell>
                </TableRow>
              )}
              {allTransactions.map((txn) => (
                <TableRow key={`${txn.direction}-${txn.id}`}>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] ${txn.direction === 'in' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}
                    >
                      {txn.direction === 'in' ? '↓ In' : '↑ Out'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{txn.counterparty ?? '—'}</TableCell>
                  <TableCell className="text-xs font-medium">
                    {txn.productName}
                    {txn.transactionType === 'DIRECT_BULK_SALE' && (
                      <Badge variant="outline" className="ml-2 text-[9px]">Direct bulk</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs">{txn.quantity?.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatRWF(Number(txn.totalAmount))}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] capitalize ${STATUS_COLORS[txn.status] ?? ''}`}
                    >
                      {txn.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {['confirmed', 'completed'].includes(txn.status) ? (
                      <PaymentStatusControl transactionId={txn.id} status={txn.paymentStatus} />
                    ) : (
                      <span className="text-xs capitalize text-muted-foreground">{txn.paymentStatus}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {txn.createdAt ? new Date(txn.createdAt).toLocaleDateString() : '—'}
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
