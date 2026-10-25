import { requireTraderSession } from '@/lib/auth-guard';
import { getMyTickets } from '@/lib/actions/support-ticket.action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { HelpCircle, Plus } from 'lucide-react';
import Link from 'next/link';
import { SupportTicketList } from '@/components/dashboard/support-ticket-list';

export default async function SupportPage() {
  await requireTraderSession();

  const tickets = await getMyTickets();
  const openCount = tickets.filter((t) => t.status === 'open').length;

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

      {openCount > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <HelpCircle className="h-3.5 w-3.5 shrink-0" />
          You have <strong>{openCount}</strong> open ticket{openCount !== 1 ? 's' : ''} awaiting response.
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-violet-500" />
            My Support Tickets ({tickets.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0"><SupportTicketList tickets={tickets} /></CardContent>
      </Card>
    </div>
  );
}
