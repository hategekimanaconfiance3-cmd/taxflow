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
import { CalendarDays, Package } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isValidDateOnly(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Roles that can edit / delete stock records. Must match admin-stock-correction.action.ts. */
const CORRECTION_ROLES = ['correction_officer', 'super_admin'] as const;

export default async function AdminStockPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { staff } = await requireRRASession(
    'stock_officer',
    'audit_officer',
    'correction_officer',
    'product_traceability_officer',
    'audit_investigation_officer',
    'tax_audit_officer',
    'revenue_investigator',
  );

  const canCorrect = staff.clearanceRoles.some((role) =>
    (CORRECTION_ROLES as readonly string[]).includes(role),
  );

  const params = await searchParams;
  const rawDateFrom = firstParam(params.from);
  const rawDateTo = firstParam(params.to);
  const dateFrom = isValidDateOnly(rawDateFrom) ? rawDateFrom : undefined;
  const dateTo = isValidDateOnly(rawDateTo) ? rawDateTo : undefined;
  const hasInvalidDate = Boolean((rawDateFrom && !dateFrom) || (rawDateTo && !dateTo));
  const datesOutOfOrder = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const filterError = hasInvalidDate
    ? 'Enter valid start and end dates.'
    : datesOutOfOrder
      ? 'The start date must be on or before the end date.'
      : '';
  const dateRangeLabel = dateFrom && dateTo
    ? `from ${dateFrom} through ${dateTo}`
    : dateFrom
      ? `from ${dateFrom} onward`
      : dateTo
        ? `through ${dateTo}`
        : '';
  const inventory = filterError
    ? []
    : await getSystemStockOverview({ dateFrom, dateTo });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stock Overview</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Filter system-wide stock levels by their last-updated date and apply corrections where discrepancies are found.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Filter by last-updated date
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" action="/admin/stock" className="flex flex-wrap items-end gap-3">
            <div className="min-w-[180px] flex-1">
              <label htmlFor="stock-date-from" className="mb-1 block text-xs font-medium text-muted-foreground">
                From
              </label>
              <input
                id="stock-date-from"
                name="from"
                type="date"
                defaultValue={rawDateFrom ?? ''}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div className="min-w-[180px] flex-1">
              <label htmlFor="stock-date-to" className="mb-1 block text-xs font-medium text-muted-foreground">
                Through (inclusive)
              </label>
              <input
                id="stock-date-to"
                name="to"
                type="date"
                defaultValue={rawDateTo ?? ''}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <Button type="submit" className="h-10">Apply dates</Button>
            {(rawDateFrom || rawDateTo) && (
              <Button asChild type="button" variant="outline" className="h-10">
                <Link href="/admin/stock">Clear</Link>
              </Button>
            )}
          </form>
          {filterError ? (
            <p role="alert" className="mt-3 text-sm text-destructive">{filterError}</p>
          ) : dateRangeLabel ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing stock records last updated {dateRangeLabel}.
            </p>
          ) : null}
        </CardContent>
      </Card>

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
                {canCorrect && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {inventory.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canCorrect ? 8 : 7} className="text-center py-8 text-muted-foreground text-sm">
                    No stock records available.
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
                  {canCorrect && (
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <EditStockDialog row={{ id: row.id, quantity: row.quantity, price: row.price, source: row.source, productName: row.productName, productUnit: row.productUnit }} />
                        <DeleteStockDialog row={{ id: row.id, quantity: row.quantity, price: row.price, source: row.source, productName: row.productName, productUnit: row.productUnit }} />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
