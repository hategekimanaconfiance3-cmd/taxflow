import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSupportTicketQueue } from "@/lib/actions/admin-support-ticket.action";
import { HelpCircle } from "lucide-react";

const statusLabels: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  waiting_for_trader: "Waiting for Trader",
  waiting_for_internal_team: "Waiting for Internal Team",
  resolved: "Resolved",
  closed: "Closed",
  reopened: "Reopened",
};

const statusColors: Record<string, string> = {
  open: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  waiting_for_trader: "bg-violet-100 text-violet-700",
  waiting_for_internal_team: "bg-indigo-100 text-indigo-700",
  resolved: "bg-emerald-100 text-emerald-700",
  closed: "bg-zinc-100 text-zinc-600",
  reopened: "bg-orange-100 text-orange-700",
};

function dateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-RW", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

export default async function AdminSupportPage() {
  const { tickets, stats, targetMinutes, canViewTin } = await getSupportTicketQueue();
  const summaries = [
    ["Total", stats.total],
    ["Open", stats.open],
    ["In Progress", stats.inProgress],
    ["Waiting for Trader", stats.waitingForTrader],
    ["Waiting for Internal Team", stats.waitingForInternalTeam],
    ["Resolved", stats.resolved],
    ["Closed", stats.closed],
    ["Reopened", stats.reopened],
    ["High Priority", stats.highPriority],
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Support Tickets</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review, investigate, and resolve trader support requests.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {summaries.map(([label, value]) => (
          <Card key={label}><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <HelpCircle className="h-4 w-4 text-violet-500" /> All Tickets
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Ticket</TableHead><TableHead>Trader / Business</TableHead>
              {canViewTin && <TableHead>TIN</TableHead>}
              <TableHead>Category</TableHead><TableHead>Subject</TableHead><TableHead>Priority</TableHead>
              <TableHead>Assigned Officer</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead>
              <TableHead>Updated</TableHead><TableHead>SLA</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {tickets.length === 0 && <TableRow><TableCell colSpan={canViewTin ? 11 : 10} className="py-8 text-center text-sm text-muted-foreground">No support tickets in your authorized queue.</TableCell></TableRow>}
              {tickets.map((ticket) => (
                <TableRow key={ticket.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell><Link className="font-mono text-xs font-semibold text-primary hover:underline" href={"/admin/support/" + ticket.id}>{ticket.ticketReference}</Link></TableCell>
                  <TableCell><Link className="block text-xs font-medium hover:underline" href={"/admin/support/" + ticket.id}>{ticket.traderName ?? ticket.traderPersonName ?? "—"}</Link></TableCell>
                  {"tinNumber" in ticket && <TableCell className="font-mono text-xs">{ticket.tinNumber ?? "—"}</TableCell>}
                  <TableCell className="text-xs capitalize text-muted-foreground"><Link href={"/admin/support/" + ticket.id}>{ticket.category.replaceAll("_", " ")}</Link></TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs"><Link href={"/admin/support/" + ticket.id}>{ticket.subject}</Link></TableCell>
                  <TableCell><Link href={"/admin/support/" + ticket.id}><Badge variant="secondary" className="capitalize">{ticket.priority}</Badge></Link></TableCell>
                  <TableCell className="text-xs"><Link href={"/admin/support/" + ticket.id}>{ticket.assignedOfficerName ?? "Unassigned"}{ticket.assignedDepartment ? " · " + ticket.assignedDepartment : ""}</Link></TableCell>
                  <TableCell><Link href={"/admin/support/" + ticket.id}><Badge variant="secondary" className={"text-[10px] " + (statusColors[ticket.status] ?? "")}>{statusLabels[ticket.status] ?? ticket.status}</Badge></Link></TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground"><Link href={"/admin/support/" + ticket.id}>{dateTime(ticket.createdAt)}</Link></TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground"><Link href={"/admin/support/" + ticket.id}>{dateTime(ticket.updatedAt)}</Link></TableCell>
                  <TableCell><Link href={"/admin/support/" + ticket.id}><Badge variant="outline" className={ticket.slaStatus === "breached" ? "border-red-300 text-red-700" : ticket.slaStatus === "on_track" ? "border-emerald-300 text-emerald-700" : ""}>{ticket.slaStatus === "not_configured" ? "Not configured" : ticket.slaStatus === "on_track" ? (targetMinutes + "m response on track") : (targetMinutes + "m response breached")}</Badge></Link></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
