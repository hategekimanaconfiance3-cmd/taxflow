import { requireTraderSession } from '@/lib/auth-guard';
import { getInventory } from '@/lib/actions/stock.action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Package } from 'lucide-react';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';

export default async function InventoryPage() {
  await requireTraderSession();

  const inventory = await getInventory();

  const totalItems = inventory.reduce((s, i) => s + i.quantity, 0);
  const totalProducts = inventory.length;
  const lowStock = inventory.filter((i) => i.quantity > 0 && i.quantity <= 10).length;
  const negativeStock = inventory.filter((i) => i.quantity < 0).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Current stock levels for all products in your business.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: 'Products', value: totalProducts },
          { label: 'Total Units', value: totalItems.toLocaleString() },
          { label: 'Low Stock', value: lowStock, warn: lowStock > 0 },
          { label: 'Negative Stock', value: negativeStock, error: negativeStock > 0 },
        ].map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-1 pt-3">
              <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
            </CardHeader>
            <CardContent className="pb-3">
              <p className={`text-xl font-bold ${item.error ? 'text-red-600' : item.warn ? 'text-amber-600' : ''}`}>
                {item.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Package className="h-4 w-4" />
            Stock Levels ({inventory.length} products)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Last Price</TableHead>
                <TableHead>Last Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inventory.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                    No inventory yet. Add products via the Production page.
                  </TableCell>
                </TableRow>
              )}
              {inventory.map((item) => (
                <TableRow key={item.id} className={item.quantity < 0 ? 'bg-red-50/40' : ''}>
                  <TableCell className="font-medium text-xs">{item.productName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{item.productUnit}</TableCell>
                  <TableCell className={`text-right font-mono text-xs font-semibold ${item.quantity < 0 ? 'text-red-600' : item.quantity === 0 ? 'text-muted-foreground' : ''}`}>
                    {item.quantity.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {item.latestUnitPrice ? formatRWF(item.latestUnitPrice) : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : '—'}
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
