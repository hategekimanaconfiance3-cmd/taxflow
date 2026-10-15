import { requireRRASession } from '@/lib/auth-guard';
import { getSystemStockOverview } from '@/lib/actions/admin-stock.action';
import { EditStockDialog, DeleteStockDialog } from '@/components/admin/stock-correction-dialogs';
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
import { Package } from 'lucide-react';

export default async function AdminStockPage() {
  await requireRRASession();

  let inventory: Awaited<ReturnType<typeof getSystemStockOverview>> = [];
  try {
    inventory = await getSystemStockOverview();
  } catch {
    // Insufficient permissions (requires stock_officer / audit_officer / correction_officer)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stock Corrections</h1>
        <p className="text-muted-foreground text-sm mt-1">
          View system-wide stock levels and apply corrections where discrepancies are found.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Package className="h-4 w-4" />
            System Stock Overview ({inventory.length} records)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inventory.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                    No stock records available. Requires stock officer, audit officer, or correction officer role.
                  </TableCell>
                </TableRow>
              )}
              {inventory.map((row) => (
                <TableRow key={row.id} className={row.quantity < 0 ? 'bg-red-50/40' : ''}>
                  <TableCell className="font-medium text-xs">
                    {row.businessName ?? row.ownerName}
                  </TableCell>
                  <TableCell className="capitalize text-xs text-muted-foreground">{row.role}</TableCell>
                  <TableCell className="text-xs">{row.productName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.productUnit}</TableCell>
                  <TableCell className={`text-right font-mono text-xs font-semibold ${row.quantity < 0 ? 'text-red-600' : ''}`}>
                    {row.quantity.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground capitalize">
                    {row.source ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1"><EditStockDialog row={{ id: row.id, quantity: row.quantity, price: row.price, source: row.source, productName: row.productName, productUnit: row.productUnit }} /><DeleteStockDialog row={{ id: row.id, quantity: row.quantity, price: row.price, source: row.source, productName: row.productName, productUnit: row.productUnit }} /></div>
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
