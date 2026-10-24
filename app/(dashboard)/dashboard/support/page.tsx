import { requireTraderSession } from '@/lib/auth-guard';
import { getMyTickets } from '@/lib/actions/support-ticket.action';
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
import { Button } from '@/components/ui/button';
import { HelpCircle, Plus } from 'lucide-react';
import Link from 'next/link';

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  waiting_for_trader: 'bg-violet-100 text-violet-700',
  waiting_for_internal_team: 'bg-indigo-100 text-indigo-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-zinc-100 text-zinc-600',
  reopened: 'bg-orange-100 text-orange-700',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-zinc-100 text-zinc-600',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

export default async function SupportPage() {
  await requireTraderSession();

  const tickets = await getMyTickets();
  const activeCount = tickets.filter((t) => t.status !== 'closed' && t.status !== 'resolved').length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Support</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Submit and track your support requests to the RRA help desk.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/dashboard/support/new">
            <Plus className="h-4 w-4 mr-1.5" />
            New Ticket
          </Link>
        </Button>
      </div>

      {activeCount > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <HelpCircle className="h-3.5 w-3.5 shrink-0" />
          You have <strong>{activeCount}</strong> active support ticket{activeCount !== 1 ? 's' : ''}.
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-violet-500" />
            My Support Tickets ({tickets.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Ticket</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Resolved</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                    No tickets yet. Click <strong>New Ticket</strong> to get help from RRA staff.
                  </TableCell>
                </TableRow>
              )}
              {tickets.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell className="font-medium text-xs max-w-[180px] truncate">
                    <Link className="hover:underline" href={'/dashboard/support/' + ticket.id}>{ticket.subject}</Link>
                  </TableCell>
                  <TableCell><Link className="font-mono text-xs text-primary hover:underline" href={'/dashboard/support/' + ticket.id}>{ticket.ticketReference}</Link></TableCell>
                  <TableCell className="text-xs text-muted-foreground capitalize">
                    {ticket.category?.replace(/_/g, ' ')}
                  </TableCell>
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
                  <TableCell className="text-xs text-muted-foreground">
                    {ticket.resolvedAt ? new Date(ticket.resolvedAt).toLocaleDateString() : '—'}
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
