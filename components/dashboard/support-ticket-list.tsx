"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, MessageSquare, Send } from "lucide-react";
import { getMyTickets, replyToMyTicket } from "@/lib/actions/support-ticket.action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Ticket = Awaited<ReturnType<typeof getMyTickets>>[number];

export function SupportTicketList({ tickets }: { tickets: Ticket[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      try {
        await replyToMyTicket(selected.id, reply);
        setReply("");
        const updated = await getMyTickets();
        setSelected(updated.find((ticket) => ticket.id === selected.id) ?? null);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Your reply could not be sent. Try again.");
      }
    });
  }

  return <div className="space-y-4">
    <Table>
      <TableHeader><TableRow><TableHead>Subject</TableHead><TableHead>Category</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead>Submitted</TableHead><TableHead /></TableRow></TableHeader>
      <TableBody>
        {tickets.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No tickets yet. Click <strong>New Ticket</strong> to get help from RRA staff.</TableCell></TableRow>}
        {tickets.map((ticket) => <TableRow key={ticket.id}>
          <TableCell className="max-w-[180px] truncate text-xs font-medium">{ticket.subject}</TableCell>
          <TableCell className="text-xs capitalize text-muted-foreground">{ticket.category.replace(/_/g, " ")}</TableCell>
          <TableCell><Badge variant="secondary" className="text-[10px] capitalize">{ticket.priority ?? "medium"}</Badge></TableCell>
          <TableCell><Badge variant="secondary" className="text-[10px] capitalize">{ticket.status.replace(/_/g, " ")}</Badge></TableCell>
          <TableCell className="text-xs text-muted-foreground">{ticket.createdAt.toLocaleDateString()}</TableCell>
          <TableCell><Button type="button" size="sm" variant="outline" onClick={() => { setSelected(ticket); setReply(""); setError(null); }}>Conversation</Button></TableCell>
        </TableRow>)}
      </TableBody>
    </Table>
    {selected && <section className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4" /><h2 className="font-semibold">{selected.subject}</h2><Badge variant="secondary">{selected.status.replace(/_/g, " ")}</Badge></div>
      <div className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">{selected.description}</div>
      <div className="space-y-3">
        {selected.messages.map((message) => <article key={message.id} className="rounded-md border p-3">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>{message.authorType} · {message.authorName}</span><time>{message.createdAt.toLocaleString()}</time></div>
          <p className="whitespace-pre-wrap text-sm">{message.body}</p>
        </article>)}
        {selected.resolution && <article className="rounded-md border border-emerald-200 bg-emerald-50 p-3"><h3 className="mb-1 text-xs font-semibold text-emerald-900">Resolution</h3><p className="whitespace-pre-wrap text-sm text-emerald-900">{selected.resolution}</p></article>}
        {selected.messages.length === 0 && !selected.resolution && <p className="text-sm text-muted-foreground">No replies yet.</p>}
      </div>
      {error && <p role="alert" className="flex items-center gap-2 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</p>}
      {selected.status !== "closed" && <form onSubmit={submitReply} className="space-y-2">
        <label className="text-sm font-medium" htmlFor="trader-ticket-reply">Reply to RRA</label>
        <Textarea id="trader-ticket-reply" value={reply} maxLength={10000} onChange={(event) => setReply(event.target.value)} disabled={pending} placeholder="Add information or respond to the support officer" />
        <Button type="submit" size="sm" disabled={pending || !reply.trim()}><Send className="mr-2 h-4 w-4" />Send reply</Button>
      </form>}
      {selected.status === "closed" && <p className="text-sm text-muted-foreground">This ticket is closed. Contact support to open a new request.</p>}
    </section>}
  </div>;
}
