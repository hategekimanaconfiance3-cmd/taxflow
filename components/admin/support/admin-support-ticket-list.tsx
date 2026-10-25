"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, LoaderCircle, MessageSquare, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { assignTicket, getAdminTicket, replyToTicket, updateTicketStatus } from "@/lib/actions/admin-support-ticket.action";
import type { getAllTickets, getSupportAssignees } from "@/lib/actions/admin-support-ticket.action";

type TicketRow = Awaited<ReturnType<typeof getAllTickets>>[number];
type Assignee = Awaited<ReturnType<typeof getSupportAssignees>>[number];
type TicketDetail = Awaited<ReturnType<typeof getAdminTicket>>;

const STATUS_COLORS: Record<string, string> = {
  open: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  resolved: "bg-emerald-100 text-emerald-700",
  closed: "bg-zinc-100 text-zinc-600",
};
const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-zinc-100 text-zinc-600",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

export function AdminSupportTicketList({ tickets, assignees, canManage }: { tickets: TicketRow[]; assignees: Assignee[]; canManage: boolean }) {
  const router = useRouter();
  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState("");
  const [resolution, setResolution] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function perform(action: () => Promise<unknown>, successMessage: string, onSuccess?: () => void) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        await action();
        setNotice(successMessage);
        onSuccess?.();
        if (selectedTicket) setSelectedTicket(await getAdminTicket(selectedTicket.id));
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The ticket could not be updated. Try again.");
      }
    });
  }

  function openTicket(id: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        setSelectedTicket(await getAdminTicket(id));
        setReply("");
        setResolution("");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Ticket details could not be loaded. Try again.");
      }
    });
  }

  return (
    <div className="space-y-5">
      {(error || notice) && <div role={error ? "alert" : "status"} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
        {error ? <AlertCircle className="h-4 w-4" /> : <Check className="h-4 w-4" />}{error ?? notice}
      </div>}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><MessageSquare className="h-4 w-4 text-violet-500" />All Tickets</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Trader</TableHead><TableHead>Category</TableHead><TableHead>Subject</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead>Submitted</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {tickets.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No support tickets match this view.</TableCell></TableRow>}
              {tickets.map((ticket) => <TableRow key={ticket.id}>
                <TableCell className="text-xs font-medium">{ticket.traderName ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground capitalize">{ticket.category.replace(/_/g, " ")}</TableCell>
                <TableCell className="max-w-[220px] truncate text-xs">{ticket.subject}</TableCell>
                <TableCell><Badge variant="secondary" className={`text-[10px] capitalize ${PRIORITY_COLORS[ticket.priority] ?? ""}`}>{ticket.priority}</Badge></TableCell>
                <TableCell><Badge variant="secondary" className={`text-[10px] capitalize ${STATUS_COLORS[ticket.status] ?? ""}`}>{ticket.status.replace(/_/g, " ")}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{ticket.createdAt.toLocaleDateString()}</TableCell>
                <TableCell><Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => openTicket(ticket.id)}>Open</Button></TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {pending && !selectedTicket && <div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />Loading ticket…</div>}
      {selectedTicket && <Card>
        <CardHeader><CardTitle className="flex flex-wrap items-center justify-between gap-3 text-base">
          <span>{selectedTicket.subject}</span><Badge variant="secondary" className={`capitalize ${STATUS_COLORS[selectedTicket.status] ?? ""}`}>{selectedTicket.status.replace(/_/g, " ")}</Badge>
        </CardTitle><p className="text-sm text-muted-foreground">{selectedTicket.traderName ?? "Trader"}{selectedTicket.traderTin ? ` · TIN ${selectedTicket.traderTin}` : ""} · {selectedTicket.category.replace(/_/g, " ")}</p></CardHeader>
        <CardContent className="space-y-5">
          <section className="rounded-md bg-muted/50 p-3"><h3 className="mb-1 text-sm font-medium">Original request</h3><p className="whitespace-pre-wrap text-sm">{selectedTicket.description}</p></section>
          {canManage ? <>
            <div className="grid gap-4 rounded-md border p-4 md:grid-cols-2">
              <section className="space-y-2"><label className="text-sm font-medium" htmlFor="ticket-assignee">Assign to authorized support staff</label>
                <div className="flex gap-2"><select key={selectedTicket.id} id="ticket-assignee" defaultValue={selectedTicket.assignedToId ?? ""} className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm" disabled={pending}>
                  <option value="" disabled>Select staff member</option>{assignees.map((assignee) => <option key={assignee.userId} value={assignee.userId}>{assignee.name}</option>)}
                </select><Button type="button" variant="outline" disabled={pending || assignees.length === 0 || selectedTicket.status === "closed"} onClick={(event) => {
                  const select = event.currentTarget.parentElement?.querySelector("select");
                  if (select?.value) perform(() => assignTicket(selectedTicket.id, select.value), "Ticket assigned.");
                }}>Assign</Button></div>{assignees.length === 0 && <p className="text-xs text-muted-foreground">No active staff with the existing support permission are available.</p>}
              </section>
              <section className="space-y-2"><label className="text-sm font-medium" htmlFor="ticket-resolution">Resolution (required to resolve)</label><Textarea id="ticket-resolution" value={resolution} maxLength={2000} onChange={(event) => setResolution(event.target.value)} placeholder="Summarize the resolution for the trader" disabled={pending || selectedTicket.status === "closed"} />
                <div className="flex flex-wrap gap-2">
                  {selectedTicket.status === "open" && <Button type="button" variant="outline" disabled={pending} onClick={() => perform(() => updateTicketStatus(selectedTicket.id, "in_progress"), "Ticket is in progress.")}>Start review</Button>}
                  {selectedTicket.status === "in_progress" && <>
                    <Button type="button" variant="outline" disabled={pending} onClick={() => perform(() => updateTicketStatus(selectedTicket.id, "open"), "Ticket returned to open.")}>Return to open</Button>
                    <Button type="button" disabled={pending || resolution.trim().length < 10} onClick={() => perform(() => updateTicketStatus(selectedTicket.id, "resolved", resolution), "Ticket resolved.")}>Resolve</Button>
                  </>}
                  {selectedTicket.status === "resolved" && <Button type="button" variant="outline" disabled={pending} onClick={() => perform(() => updateTicketStatus(selectedTicket.id, "closed"), "Ticket closed.")}>Close</Button>}
                  {(selectedTicket.status === "closed" || selectedTicket.status === "resolved") && <Button type="button" variant="outline" disabled={pending} onClick={() => perform(() => updateTicketStatus(selectedTicket.id, "in_progress"), "Ticket reopened.")}>Reopen</Button>}
                </div>
              </section>
            </div>
            <form className="space-y-2 rounded-md border p-4" onSubmit={(event) => { event.preventDefault(); perform(() => replyToTicket(selectedTicket.id, reply), "Reply sent to the trader.", () => setReply("")); }}>
              <label className="text-sm font-medium" htmlFor="ticket-reply">Reply to trader</label>
              <Textarea id="ticket-reply" value={reply} maxLength={10000} onChange={(event) => setReply(event.target.value)} placeholder="Write a response" disabled={pending || selectedTicket.status === "closed"} />
              <Button type="submit" size="sm" disabled={pending || !reply.trim() || selectedTicket.status === "closed"}><Send className="mr-2 h-4 w-4" />Send reply</Button>
            </form>
          </> : <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">Your current role has view-only access to support tickets. Replies, assignments, and status changes require the existing <strong>support.manage</strong> permission.</div>}
          <section className="space-y-3"><h3 className="text-sm font-semibold">Conversation</h3>
            {selectedTicket.messages.length === 0 && <p className="text-sm text-muted-foreground">No replies yet.</p>}
            {selectedTicket.messages.map((message) => <article key={message.id} className="rounded-md border p-3">
              <div className="mb-1 flex justify-between gap-3 text-xs text-muted-foreground"><span>{message.authorName}{message.authorId === selectedTicket.traderId ? " · Trader" : " · RRA staff"}</span><time>{message.createdAt.toLocaleString()}</time></div>
              <p className="whitespace-pre-wrap text-sm">{message.body}</p>
            </article>)}
          </section>
        </CardContent>
      </Card>}
    </div>
  );
}
