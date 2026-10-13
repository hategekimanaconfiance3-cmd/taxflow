import { requireRRASession } from '@/lib/auth-guard';
import {
  getUnregisteredBuyers,
  getGhostTaxpayers,
  getPendingApprovals,
} from '@/lib/actions/admin-taxpayer-discovery.action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { UserSearch, AlertTriangle, Clock, Database } from 'lucide-react';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';

export default async function AdminUnregisteredPage() {
  await requireRRASession();

  let buyers: Awaited<ReturnType<typeof getUnregisteredBuyers>> = [];
  let ghosts: Awaited<ReturnType<typeof getGhostTaxpayers>> = [];
  let pending: Awaited<ReturnType<typeof getPendingApprovals>> = [];

  try {
    [buyers, ghosts, pending] = await Promise.all([
      getUnregisteredBuyers(),
      getGhostTaxpayers(),
      getPendingApprovals(),
    ]);
  } catch {
    // Insufficient permissions (requires compliance_officer / audit_officer)
  }

  const highValueBuyers = buyers.filter((b) => b.totalValue >= 1_000_000);
  const b2bBuyers = buyers.filter((b) => b.isB2B);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Unregistered Taxpayer Discovery</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Cross-referenced supply chain buyers, TIN registry ghosts, and pending approvals — potential tax base expansion targets.
        </p>
      </div>

      {/* Summary alerts */}
      <div className="flex flex-wrap gap-3">
        {b2bBuyers.length > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
            <span>
              <strong>{b2bBuyers.length}</strong> B2B ghost buyer{b2bBuyers.length !== 1 ? 's' : ''} — businesses buying from manufacturers/wholesalers without registration.
            </span>
          </div>
        )}
        {highValueBuyers.length > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span>
              <strong>{highValueBuyers.length}</strong> buyer{highValueBuyers.length !== 1 ? 's' : ''} with ≥ 1M RWF in purchases — formal registration candidates.
            </span>
          </div>
        )}
        {pending.length > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            <Clock className="h-3.5 w-3.5 shrink-0 text-blue-500" />
            <span>
              <strong>{pending.length}</strong> trader{pending.length !== 1 ? 's' : ''} awaiting approval — review required before they can trade.
            </span>
          </div>
        )}
      </div>

      {/* Pending Approvals */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-500" />
            Pending Approval Queue ({pending.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business / Name</TableHead>
                <TableHead>TIN</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead className="text-right">Days Pending</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                    No traders pending approval. Requires compliance officer or audit officer role.
                  </TableCell>
                </TableRow>
              )}
              {pending.map((t) => (
                <TableRow
                  key={t.userId}
                  className={t.daysPending > 7 ? 'bg-blue-50/40' : ''}
                >
                  <TableCell className="font-medium text-xs">
                    {t.businessName ?? t.name}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {t.tinNumber ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className="capitalize">{t.role}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{t.email}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(t.registeredAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className={`text-right text-xs font-semibold ${t.daysPending > 7 ? 'text-blue-700' : ''}`}>
                    {t.daysPending}d
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Ghost Taxpayers from TIN Registry */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Database className="h-4 w-4 text-rose-500" />
            TIN Registry — Unregistered on TaxFlow ({ghosts.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>TIN</TableHead>
                <TableHead>Business Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>District</TableHead>
                <TableHead>Phone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ghosts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                    All TIN registry entries are registered on TaxFlow — or insufficient permissions.
                  </TableCell>
                </TableRow>
              )}
              {ghosts.map((g) => (
                <TableRow key={g.tinNumber}>
                  <TableCell className="font-mono text-xs font-semibold text-rose-700">{g.tinNumber}</TableCell>
                  <TableCell className="text-xs font-medium">{g.businessName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground capitalize">
                    {g.businessType ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{g.district ?? '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{g.phone}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Unregistered Buyers from Transactions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <UserSearch className="h-4 w-4 text-violet-500" />
            Transaction Ghost Buyers ({buyers.length} unique names)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Buyer Name</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead className="text-right">Purchases</TableHead>
                <TableHead className="text-right">Total Value</TableHead>
                <TableHead>Last Seen</TableHead>
                <TableHead>Sold By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buyers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                    No unregistered buyer data. Requires compliance officer or audit officer role.
                  </TableCell>
                </TableRow>
              )}
              {buyers.map((buyer, i) => (
                <TableRow
                  key={i}
                  className={buyer.isB2B ? 'bg-red-50/40' : buyer.totalValue >= 1_000_000 ? 'bg-amber-50/40' : ''}
                >
                  <TableCell className="font-medium text-xs">{buyer.buyerName}</TableCell>
                  <TableCell className="text-xs">
                    <Badge
                      variant="outline"
                      className={buyer.isB2B ? 'border-red-300 text-red-700 bg-red-50' : 'border-gray-200 text-gray-600'}
                    >
                      {buyer.isB2B ? 'B2B' : 'Retail'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-xs">{buyer.transactionCount}</TableCell>
                  <TableCell className={`text-right font-mono text-xs font-semibold ${buyer.isB2B ? 'text-red-700' : buyer.totalValue >= 1_000_000 ? 'text-amber-700' : ''}`}>
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
