import { requireRRASession } from '@/lib/auth-guard';
import { getUnregisteredBuyers } from '@/lib/actions/admin-taxpayer-discovery.action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { UserSearch, AlertTriangle } from 'lucide-react';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';

export default async function AdminUnregisteredPage() {
  await requireRRASession();

  let buyers: Awaited<ReturnType<typeof getUnregisteredBuyers>> = [];
  try {
    buyers = await getUnregisteredBuyers();
  } catch {
    // Insufficient permissions (requires compliance_officer / audit_officer)
  }

  const highValueBuyers = buyers.filter((b) => b.totalValue >= 1_000_000);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Unregistered Taxpayer Discovery</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Consumer names from retail transactions that appear unregistered — potential tax base expansion targets.
        </p>
      </div>

      {highValueBuyers.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span>
            <strong>{highValueBuyers.length}</strong> consumer{highValueBuyers.length !== 1 ? 's' : ''} with purchases ≥ 1M RWF — potential formal registration candidates.
          </span>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <UserSearch className="h-4 w-4 text-violet-500" />
            Unregistered Consumer Activity ({buyers.length} unique names)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Consumer Name</TableHead>
                <TableHead className="text-right">Purchases</TableHead>
                <TableHead className="text-right">Total Value</TableHead>
                <TableHead>Last Seen</TableHead>
                <TableHead>Sold By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buyers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                    No unregistered buyer data. Requires compliance officer or audit officer role.
                  </TableCell>
                </TableRow>
              )}
              {buyers.map((buyer, i) => (
                <TableRow
                  key={i}
                  className={buyer.totalValue >= 1_000_000 ? 'bg-amber-50/40' : ''}
                >
                  <TableCell className="font-medium text-xs">{buyer.buyerName}</TableCell>
                  <TableCell className="text-right text-xs">{buyer.transactionCount}</TableCell>
                  <TableCell className={`text-right font-mono text-xs font-semibold ${buyer.totalValue >= 1_000_000 ? 'text-amber-700' : ''}`}>
                    {formatRWF(buyer.totalValue)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {buyer.lastSeenAt ? new Date(buyer.lastSeenAt).toLocaleDateString() : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {buyer.sellerNames.slice(0, 2).join(', ')}
                    {buyer.sellerNames.length > 2 ? ` +${buyer.sellerNames.length - 2}` : ''}
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
