"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowLeft, CheckCircle2, MessageSquare, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { confirmSupportTicketResolution, getMySupportTicket, sendTraderSupportTicketMessage } from "@/lib/actions/support-ticket.action";
import { ticketMessageSchema, traderTicketConfirmationSchema } from "@/lib/validation/support-ticket";
import type { z } from "zod";

type TraderDetail = NonNullable<Awaited<ReturnType<typeof getMySupportTicket>>>;
type MessageValues = z.infer<typeof ticketMessageSchema>;
type ConfirmationValues = z.infer<typeof traderTicketConfirmationSchema>;

const labels: Record<string, string> = {
  open: "Open", in_progress: "In Progress", waiting_for_trader: "Waiting for You",
  waiting_for_internal_team: "Waiting for Internal Team", resolved: "Resolved", closed: "Closed", reopened: "Reopened",
};

function formatDate(value: Date | null): string {
  return value ? new Intl.DateTimeFormat("en-RW", { dateStyle: "medium", timeStyle: "short" }).format(value) : "—";
}

export function TraderSupportTicketDetail({ detail }: { detail: TraderDetail }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const ticket = detail.ticket;
  const messageForm = useForm<MessageValues>({ resolver: zodResolver(ticketMessageSchema), defaultValues: { ticketId: ticket.id, body: "" } });
  const confirmationForm = useForm<ConfirmationValues>({ resolver: zodResolver(traderTicketConfirmationSchema), defaultValues: { ticketId: ticket.id, resolved: false, reason: "" } });

  function perform(action: () => Promise<unknown>, success: string) {
    setNotice("");
    setError("");
    startTransition(async () => {
      try {
        await action();
        setNotice(success);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to update ticket. Please try again.");
      }
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2"><Link href="/dashboard/support"><ArrowLeft className="mr-1 h-4 w-4" />Back to Support</Link></Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="font-mono text-xs text-muted-foreground">{ticket.ticketReference}</p><h1 className="text-2xl font-bold tracking-tight">{ticket.subject}</h1><p className="mt-1 text-sm capitalize text-muted-foreground">{ticket.category.replaceAll("_", " ")} · Submitted {formatDate(ticket.createdAt)}</p></div>
          <Badge variant="secondary">{labels[ticket.status] ?? ticket.status}</Badge>
        </div>
      </div>

      {(notice || error) && <div role={error ? "alert" : "status"} className={"flex items-center gap-2 rounded-md border px-3 py-2 text-sm " + (error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
        {error ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{error || notice}
      </div>}

      <Card>
        <CardHeader><CardTitle className="text-base">Your request</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2"><Badge variant="outline" className="capitalize">{ticket.priority} priority</Badge>{ticket.resolutionCategory && <Badge variant="outline" className="capitalize">{ticket.resolutionCategory.replaceAll("_", " ")}</Badge>}</div>
          <p className="whitespace-pre-wrap text-sm leading-6">{ticket.description}</p>
          {ticket.resolution && <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3"><p className="font-medium">Resolution summary</p><p className="mt-1 whitespace-pre-wrap text-sm">{ticket.resolution}</p><p className="mt-2 text-xs text-muted-foreground">Updated {formatDate(ticket.resolvedAt)}</p></div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-4 w-4" />Conversation</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3"><div className="mb-2 flex justify-between gap-2 text-xs text-muted-foreground"><span>You · Submitted</span><span>{formatDate(ticket.createdAt)}</span></div><p className="whitespace-pre-wrap text-sm">{ticket.description}</p></div>
          {detail.messages.map((message) => <div key={message.id} className="rounded-md border p-3">
            <div className="mb-2 flex justify-between gap-2 text-xs text-muted-foreground"><span>{message.senderUserId === ticket.traderId ? "You" : "RRA Support"}</span><span>{formatDate(message.createdAt)}</span></div>
            <p className="whitespace-pre-wrap text-sm">{message.body}</p>
          </div>)}
          {detail.messages.length === 0 && <p className="text-sm text-muted-foreground">No replies yet.</p>}
          {ticket.status !== "closed" && <form className="space-y-2 border-t pt-4" onSubmit={messageForm.handleSubmit((values) => perform(() => sendTraderSupportTicketMessage(values), "Your message was sent to RRA support."))}>
            <Label htmlFor="trader-ticket-reply">Reply to RRA</Label>
            <Textarea id="trader-ticket-reply" rows={3} maxLength={5000} disabled={pending} placeholder="Add details or respond to an information request." {...messageForm.register("body")} />
            {messageForm.formState.errors.body?.message && <p role="alert" className="text-sm text-red-600">{messageForm.formState.errors.body.message}</p>}
            <Button type="submit" disabled={pending || messageForm.formState.isSubmitting} className="gap-2"><Send className="h-4 w-4" />Send Reply</Button>
          </form>}
        </CardContent>
      </Card>

      {ticket.status === "resolved" && <Card>
        <CardHeader><CardTitle className="text-base">Has your issue been resolved?</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Confirm the resolution or reopen the ticket if you still need help.</p>
          <Textarea rows={2} maxLength={2000} disabled={pending} placeholder="Optional: explain what is still wrong" {...confirmationForm.register("reason")} />
          {confirmationForm.formState.errors.reason?.message && <p role="alert" className="text-sm text-red-600">{confirmationForm.formState.errors.reason.message}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending} onClick={() => { confirmationForm.setValue("resolved", true); void confirmationForm.handleSubmit((values) => perform(() => confirmSupportTicketResolution(values), "Thanks for confirming. Your ticket is closed."))(); }}>Issue Resolved</Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => { confirmationForm.setValue("resolved", false); void confirmationForm.handleSubmit((values) => perform(() => confirmSupportTicketResolution(values), "Your ticket has been reopened for follow-up."))(); }}>Issue Not Resolved</Button>
          </div>
        </CardContent>
      </Card>}
      {ticket.assignedOfficerName && <p className="text-xs text-muted-foreground">Assigned RRA officer: {ticket.assignedOfficerName}</p>}
    </div>
  );
}
