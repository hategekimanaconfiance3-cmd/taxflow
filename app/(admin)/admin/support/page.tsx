import { requireRRAOperationalPermission } from '@/lib/auth-guard';
import { getAllTickets } from '@/lib/actions/admin-support-ticket.action';
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
import { HelpCircle } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-zinc-100 text-zinc-600',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-zinc-100 text-zinc-600',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<{ tin?: string }> }) {
  await requireRRAOperationalPermission("support.manage");
  const params = await searchParams;
  const tin = params.tin?.trim();
  const tickets = await getAllTickets(undefined, tin);

  const open = tickets.filter((t) => t.status === 'open').length;
  const inProgress = tickets.filter((t) => t.status === 'in_progress').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Support Tickets</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {tin ? `Support requests for TIN ${tin}.` : "Review and resolve trader-submitted support requests."}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="bg-amber-100 text-amber-700">
          {open} open
        </Badge>
        <Badge variant="secondary" className="bg-blue-100 text-blue-700">
          {inProgress} in progress
        </Badge>
        <Badge variant="secondary" className="bg-zinc-100 text-zinc-600">
          {tickets.length} total
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-violet-500" />
            All Tickets
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trader</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                    No support tickets yet.
                  </TableCell>
                </TableRow>
              )}
              {tickets.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell className="font-medium text-xs">{ticket.traderName ?? '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground capitalize">
                    {ticket.category?.replace(/_/g, ' ')}
                  </TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{ticket.subject}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] capitalize ${PRIORITY_COLORS[ticket.priority ?? 'low'] ?? ''}`}
                    >
                      {ticket.priority ?? 'low'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] capitalize ${STATUS_COLORS[ticket.status] ?? ''}`}
                    >
                      {ticket.status?.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString() : '—'}
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
