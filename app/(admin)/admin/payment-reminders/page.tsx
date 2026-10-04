import { requireRRASession } from '@/lib/auth-guard';
import { getTradersWithUnpaidVat } from '@/lib/actions/admin-payment-reminder.action';
import { SendReminderButton, SendBulkRemindersButton } from '@/components/admin/payment-reminder-actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Bell } from 'lucide-react';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';

export default async function AdminPaymentRemindersPage() {
  await requireRRASession();

  let traders: Awaited<ReturnType<typeof getTradersWithUnpaidVat>> = [];
  try {
    traders = await getTradersWithUnpaidVat();
  } catch {
    // Insufficient permissions
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payment Reminders</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Traders with outstanding VAT balances. Send individual or bulk reminders.
          </p>
        </div>
        {traders.length > 0 && (
          <SendBulkRemindersButton count={traders.length} />
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-500" />
            Traders with Unpaid VAT ({traders.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trader</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">VAT Due</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {traders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                    No traders with outstanding VAT, or access requires compliance officer role.
                  </TableCell>
                </TableRow>
              )}
              {traders.map((trader) => (
                <TableRow key={trader.traderId}>
                  <TableCell className="font-medium text-xs">{trader.traderName}</TableCell>
                  <TableCell className="capitalize text-xs text-muted-foreground">{trader.role}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatRWF(trader.totalVatDue)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-emerald-600">
                    {formatRWF(trader.totalPaid)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-red-600 font-semibold">
                    {formatRWF(trader.outstanding)}
                  </TableCell>
                  <TableCell className="text-right">
                    <SendReminderButton
                      traderId={trader.traderId}
                      amount={trader.outstanding}
                    />
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
