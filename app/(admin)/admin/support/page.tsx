import { requireRRAOperationalPermission } from "@/lib/auth-guard";
import { getAdminTicket, getAllTickets, getSupportAssignees } from "@/lib/actions/admin-support-ticket.action";
import { AdminSupportTicketList } from "@/components/admin/support/admin-support-ticket-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getTicketStats } from "@/lib/actions/admin-support-ticket.action";
import { hasOperationalRRAPermission } from "@/lib/rra-rbac";
import { HelpCircle } from "lucide-react";

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<{ tin?: string; ticket?: string }> }) {
  const { staff } = await requireRRAOperationalPermission("support.read");
  const canManage = hasOperationalRRAPermission(staff.clearanceRoles, "support.manage");
  const params = await searchParams;
  const tin = params.tin?.trim();
  const ticketId = params.ticket?.trim();
  const [tickets, assignees, stats, initialTicket] = await Promise.all([
    getAllTickets(undefined, tin),
    canManage ? getSupportAssignees() : Promise.resolve([]),
    getTicketStats(),
    ticketId && ticketId.length <= 100 ? getAdminTicket(ticketId).catch(() => null) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Support Tickets</h1>
        <p className="mt-1 text-sm text-muted-foreground">{tin ? `Support requests for TIN ${tin}.` : canManage ? "Review and respond to trader support requests." : "Review trader support requests and conversation history. Your current role has view-only access."}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="secondary" className="bg-amber-100 text-amber-700">{stats.open} open</Badge>
        <Badge variant="secondary" className="bg-blue-100 text-blue-700">{stats.inProgress} in progress</Badge>
        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">{stats.resolved} resolved</Badge>
        <Badge variant="secondary" className="bg-zinc-100 text-zinc-600">{stats.closed} closed</Badge>
        <Badge variant="secondary">{stats.total} total</Badge>
      </div>
      <Card><CardContent className="flex items-center gap-2 py-3 text-xs text-muted-foreground"><HelpCircle className="h-4 w-4 text-violet-500" />Ticket changes and replies are recorded with an audit trail.</CardContent></Card>
      <AdminSupportTicketList tickets={tickets} assignees={assignees} canManage={canManage} initialTicket={initialTicket} />
    </div>
  );
}
