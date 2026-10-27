import { requireTraderSession } from '@/lib/auth-guard';
import { getOutgoingTransactions } from '@/lib/actions/transaction.action';
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
import { BarChart2 } from 'lucide-react';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-blue-100 text-blue-700',
  pending: 'bg-amber-100 text-amber-700',
  rejected: 'bg-red-100 text-red-700',
  expired: 'bg-zinc-100 text-zinc-600',
};

export default async function SalesPage() {
  await requireTraderSession();

  const sales = await getOutgoingTransactions();
  const completed = sales.filter((s) => ['confirmed', 'completed'].includes(s.status));
  const totalRevenue = completed.reduce((sum, s) => sum + Number(s.totalAmount), 0);
  const totalVat = completed.reduce((sum, s) => sum + Number(s.vatAmount), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sales History</h1>
        <p className="text-muted-foreground text-sm mt-1">
          All outgoing transactions — B2B sales and retail sales you have created.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Total Revenue', value: formatRWF(totalRevenue), cls: 'text-emerald-600' },
          { label: 'VAT Collected', value: formatRWF(totalVat), cls: 'text-violet-600' },
          { label: 'Total Transactions', value: sales.length.toLocaleString(), cls: '' },
        ].map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-1 pt-3">
              <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
            </CardHeader>
            <CardContent className="pb-3">
              <p className={`text-xl font-bold font-mono ${item.cls}`}>{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart2 className="h-4 w-4" />
            Sales ({sales.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Buyer</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">VAT</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                    No sales yet. Use the <strong>Sell</strong> page to create your first transaction.
                  </TableCell>
                </TableRow>
              )}
              {sales.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell className="text-xs">{sale.buyerName ?? '—'}</TableCell>
                  <TableCell className="text-xs font-medium">{sale.productName}</TableCell>
                  <TableCell className="text-right text-xs">{sale.quantity?.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatRWF(Number(sale.totalAmount))}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {formatRWF(Number(sale.vatAmount))}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] capitalize ${STATUS_COLORS[sale.status] ?? ''}`}
                    >
                      {sale.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {sale.createdAt ? new Date(sale.createdAt).toLocaleDateString() : '—'}
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
