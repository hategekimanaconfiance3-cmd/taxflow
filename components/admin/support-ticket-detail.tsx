"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowLeft, Bot, Check, Clock3, Loader2, MessageSquare, Send, ShieldCheck, StickyNote, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  addSupportTicketInternalNote,
  assignSupportTicket,
  escalateSupportTicket,
  getAdminSupportTicketDetail,
  getSupportTicketAiDraft,
  requestSupportTicketInformation,
  resolveSupportTicket,
  sendSupportTicketReply,
  takeSupportTicket,
} from "@/lib/actions/admin-support-ticket.action";
import { ticketEscalationSchema, ticketInternalNoteSchema, ticketMessageSchema, ticketResolutionSchema } from "@/lib/validation/support-ticket";
import type { z } from "zod";

type Detail = NonNullable<Awaited<ReturnType<typeof getAdminSupportTicketDetail>>>;
type MessageValues = z.infer<typeof ticketMessageSchema>;
type NoteValues = z.infer<typeof ticketInternalNoteSchema>;
type EscalationValues = z.infer<typeof ticketEscalationSchema>;
type ResolutionValues = z.infer<typeof ticketResolutionSchema>;

const statusLabels: Record<string, string> = {
  open: "Open", in_progress: "In Progress", waiting_for_trader: "Waiting for Trader",
  waiting_for_internal_team: "Waiting for Internal Team", resolved: "Resolved", closed: "Closed", reopened: "Reopened",
};

function formatDate(value: Date | null): string {
  return value ? new Intl.DateTimeFormat("en-RW", { dateStyle: "medium", timeStyle: "short" }).format(value) : "—";
}

function FormError({ message }: { message?: string }) {
  return message ? <p role="alert" className="text-sm text-red-600">{message}</p> : null;
}

export function AdminSupportTicketDetail({ detail }: { detail: Detail }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [assignee, setAssignee] = useState("");
  const [department, setDepartment] = useState("");
  const [escalationAssignee, setEscalationAssignee] = useState("");
  const [aiMode, setAiMode] = useState<"analyze" | "draft_reply" | "draft_resolution">("analyze");
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiText, setAiText] = useState("");
  const ticket = detail.ticket;
  const replyForm = useForm<MessageValues>({ resolver: zodResolver(ticketMessageSchema), defaultValues: { ticketId: ticket.id, body: "" } });
  const requestForm = useForm<MessageValues>({ resolver: zodResolver(ticketMessageSchema), defaultValues: { ticketId: ticket.id, body: "" } });
  const noteForm = useForm<NoteValues>({ resolver: zodResolver(ticketInternalNoteSchema), defaultValues: { ticketId: ticket.id, body: "", category: "" } });
  const escalationForm = useForm<EscalationValues>({ resolver: zodResolver(ticketEscalationSchema), defaultValues: { ticketId: ticket.id, department: "", assignedToUserId: "", reason: "" } });
  const resolutionForm = useForm<ResolutionValues>({ resolver: zodResolver(ticketResolutionSchema), defaultValues: { ticketId: ticket.id, summary: "", category: "other" } });
  const resolutionCategory = useWatch({ control: resolutionForm.control, name: "category" });

  function runAction(action: () => Promise<unknown>, success: string) {
    setError("");
    setNotice("");
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

  const canTake = ticket.status === "open" || ticket.status === "reopened" || ticket.status === "waiting_for_internal_team";
  const canRequest = ticket.status === "in_progress";
  const canReply = ticket.status !== "closed" && ticket.status !== "resolved";
  const canWork = detail.capabilities.canUpdate && ticket.status !== "closed";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm" className="-ml-2"><Link href="/admin/support"><ArrowLeft className="mr-1 h-4 w-4" />Back to tickets</Link></Button>
          <div>
            <p className="font-mono text-xs text-muted-foreground">{ticket.ticketReference}</p>
            <h1 className="text-2xl font-bold tracking-tight">{ticket.subject}</h1>
            <p className="mt-1 text-sm capitalize text-muted-foreground">{ticket.category.replaceAll("_", " ")} · Submitted {formatDate(ticket.createdAt)}</p>
          </div>
        </div>
        <Badge variant="secondary" className="px-3 py-1">{statusLabels[ticket.status] ?? ticket.status}</Badge>
      </div>

      {(notice || error) && <div role={error ? "alert" : "status"} className={"flex items-center gap-2 rounded-md border px-3 py-2 text-sm " + (error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
        {error ? <AlertCircle className="h-4 w-4" /> : <Check className="h-4 w-4" />}{error || notice}
      </div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Customer issue</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-wrap text-sm leading-6">{ticket.description}</p>
              <Badge variant="outline" className="capitalize">{ticket.priority} priority</Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Investigation</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <div><p className="text-muted-foreground">Trader / business</p><p className="font-medium">{ticket.traderName ?? ticket.traderPersonName}</p></div>
              {detail.capabilities.canViewTin && <div><p className="text-muted-foreground">TIN</p><p className="font-mono">{ticket.tinNumber ?? "—"}</p></div>}
              <div><p className="text-muted-foreground">Submitted</p><p>{formatDate(ticket.createdAt)}</p></div>
              <div><p className="text-muted-foreground">Last updated</p><p>{formatDate(ticket.updatedAt)}</p></div>
              <div><p className="text-muted-foreground">First response</p><p>{formatDate(ticket.firstResponseAt)}</p></div>
              {detail.relatedTransaction && <div className="rounded-md border p-3 sm:col-span-2">
                <p className="font-medium">Related transaction (authorized view)</p>
                <p className="mt-1 font-mono text-xs">{detail.relatedTransaction.id}</p>
                <p className="text-muted-foreground">{detail.relatedTransaction.productName} · {detail.relatedTransaction.status} · {formatDate(detail.relatedTransaction.createdAt)}</p>
                <p>{new Intl.NumberFormat("en-RW", { style: "currency", currency: "RWF", maximumFractionDigits: 0 }).format(detail.relatedTransaction.totalAmount)}</p>
              </div>}
              {!detail.relatedTransaction && <p className="text-xs text-muted-foreground sm:col-span-2">No linked transaction reference was found in this ticket.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-4 w-4" />Conversation with trader</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="mb-2 flex justify-between gap-2 text-xs text-muted-foreground"><span>{ticket.traderName ?? ticket.traderPersonName} · Ticket submission</span><span>{formatDate(ticket.createdAt)}</span></div>
                <p className="whitespace-pre-wrap text-sm">{ticket.description}</p>
              </div>
              {detail.messages.map((item) => <div key={item.id} className="rounded-md border p-3">
                <div className="mb-2 flex justify-between gap-2 text-xs text-muted-foreground"><span>{item.senderName ?? "Account no longer active"}</span><span>{formatDate(item.createdAt)}</span></div>
                <p className="whitespace-pre-wrap text-sm">{item.body}</p>
              </div>)}
              {detail.messages.length === 0 && <p className="text-sm text-muted-foreground">No replies yet.</p>}
              {canWork && canReply && <form className="space-y-2 border-t pt-4" onSubmit={replyForm.handleSubmit((values) => runAction(() => sendSupportTicketReply(values), "Reply sent to trader."))}>
                <Label htmlFor="ticket-reply">Message to trader</Label>
                <Textarea id="ticket-reply" rows={3} maxLength={5000} disabled={pending} {...replyForm.register("body")} placeholder="Write a clear, professional reply." />
                <FormError message={replyForm.formState.errors.body?.message} />
                <Button type="submit" disabled={pending || replyForm.formState.isSubmitting} className="gap-2"><Send className="h-4 w-4" />Send Reply</Button>
              </form>}
              {canWork && canRequest && <form className="space-y-2 border-t pt-4" onSubmit={requestForm.handleSubmit((values) => runAction(() => requestSupportTicketInformation(values), "Information request sent; ticket is waiting for the trader."))}>
                <Label htmlFor="ticket-request-info">Request information</Label>
                <Textarea id="ticket-request-info" rows={2} maxLength={5000} disabled={pending} {...requestForm.register("body")} placeholder="Explain what information the trader should provide." />
                <FormError message={requestForm.formState.errors.body?.message} />
                <Button type="submit" variant="outline" disabled={pending || requestForm.formState.isSubmitting}>Waiting for Trader</Button>
              </form>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><StickyNote className="h-4 w-4" />Internal notes <Badge variant="outline">RRA only</Badge></CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {detail.internalNotes.map((note) => <div key={note.id} className="rounded-md border border-amber-200 bg-amber-50/50 p-3">
                <div className="mb-2 flex justify-between gap-2 text-xs text-muted-foreground"><span>{note.authorName ?? "Former employee"}{note.category ? " · " + note.category : ""}</span><span>{formatDate(note.createdAt)}</span></div>
                <p className="whitespace-pre-wrap text-sm">{note.body}</p>
              </div>)}
              {detail.internalNotes.length === 0 && <p className="text-sm text-muted-foreground">No internal notes.</p>}
              {canWork && <form className="space-y-2 border-t pt-4" onSubmit={noteForm.handleSubmit((values) => runAction(() => addSupportTicketInternalNote(values), "Internal note saved."))}>
                <Label htmlFor="ticket-note">Add internal note</Label>
                <Input id="ticket-note-category" maxLength={80} disabled={pending} placeholder="Optional category" {...noteForm.register("category")} />
                <Textarea id="ticket-note" rows={3} maxLength={5000} disabled={pending} {...noteForm.register("body")} placeholder="Visible only to authorized RRA staff." />
                <FormError message={noteForm.formState.errors.body?.message} />
                <Button type="submit" variant="outline" disabled={pending || noteForm.formState.isSubmitting}>Add Internal Note</Button>
              </form>}
            </CardContent>
          </Card>

          {detail.capabilities.canUseAi && <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bot className="h-4 w-4" />AI assistant</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">AI output is advisory only. An authorized employee must review and decide.</p>
              <Select value={aiMode} onValueChange={(value) => setAiMode(value as typeof aiMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="analyze">Analyze ticket</SelectItem>
                  <SelectItem value="draft_reply">Draft trader reply</SelectItem>
                  <SelectItem value="draft_resolution">Draft resolution summary</SelectItem>
                </SelectContent>
              </Select>
              <Input value={aiQuestion} maxLength={1000} onChange={(event) => setAiQuestion(event.target.value)} placeholder="Optional question or drafting direction" disabled={pending} />
              <Button type="button" variant="outline" disabled={pending} onClick={() => runAction(async () => {
                const response = await getSupportTicketAiDraft({ ticketId: ticket.id, mode: aiMode, question: aiQuestion });
                setAiText(response.label + "\n\n" + response.text);
              }, "AI recommendation ready.")}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}Ask AI About This Ticket</Button>
              {aiText && <div role="status" className="whitespace-pre-wrap rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">{aiText}</div>}
            </CardContent>
          </Card>}

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Clock3 className="h-4 w-4" />Activity timeline</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {detail.events.map((event) => <div key={event.id} className="flex gap-3 border-l-2 pl-3">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-medium capitalize">{event.eventType.replaceAll("_", " ")}</p><time className="text-xs text-muted-foreground">{formatDate(event.createdAt)}</time></div>
                  <p className="text-xs text-muted-foreground">{event.actorName ?? "System"}{event.previousStatus && event.newStatus ? " · " + (statusLabels[event.previousStatus] ?? event.previousStatus) + " → " + (statusLabels[event.newStatus] ?? event.newStatus) : ""}</p>
                </div>
              </div>)}
              {detail.events.length === 0 && <p className="text-sm text-muted-foreground">No activity recorded yet.</p>}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card><CardHeader><CardTitle className="text-base">Ticket status</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
            <p className="font-semibold">{statusLabels[ticket.status] ?? ticket.status}</p>
            <p className="text-muted-foreground">Priority: <span className="font-medium capitalize text-foreground">{ticket.priority}</span></p>
            <p className="text-muted-foreground">Assigned to: <span className="text-foreground">{ticket.assignedOfficerName ?? "Unassigned"}</span></p>
            <p className="text-muted-foreground">Department: <span className="text-foreground">{ticket.assignedDepartment ?? "Not assigned"}</span></p>
            <p className="text-muted-foreground">First-response SLA: <span className="text-foreground">{ticket.slaTargetMinutes ? ticket.slaStatus + " · " + ticket.slaTargetMinutes + " min target" : "Not configured"}</span></p>
            <p className="text-muted-foreground">Current duration: <span className="text-foreground">{ticket.currentDurationMinutes} min</span></p>
            <p className="text-muted-foreground">Resolution duration: <span className="text-foreground">{ticket.resolutionDurationMinutes === null ? "—" : ticket.resolutionDurationMinutes + " min"}</span></p>
            {ticket.resolution && <div className="rounded-md border bg-muted/30 p-3"><p className="font-medium">Resolution</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{ticket.resolution}</p><p className="mt-2 text-xs text-muted-foreground">Resolved {formatDate(ticket.resolvedAt)}</p></div>}
          </CardContent></Card>

          {canTake && !ticket.assignedToId && <Button className="w-full" disabled={pending} onClick={() => runAction(() => takeSupportTicket(ticket.id), "Ticket assigned to you.")}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserRound className="mr-2 h-4 w-4" />}Take Ticket</Button>}
          {canTake && ticket.assignedToId === detail.currentUserId && ticket.status !== "in_progress" && <Button className="w-full" disabled={pending} onClick={() => runAction(() => takeSupportTicket(ticket.id), "Ticket is now in progress.")}>Start work</Button>}

          {detail.capabilities.canAssign && ticket.status !== "closed" && ticket.status !== "resolved" && <Card><CardHeader><CardTitle className="text-sm">Assign ticket</CardTitle></CardHeader><CardContent className="space-y-2">
            <Select value={assignee} onValueChange={setAssignee}><SelectTrigger><SelectValue placeholder="Choose authorized officer" /></SelectTrigger><SelectContent>{detail.assignees.map((employee) => <SelectItem value={employee.userId} key={employee.userId}>{employee.name}{employee.department ? " · " + employee.department : ""}</SelectItem>)}</SelectContent></Select>
            <Button className="w-full" variant="outline" disabled={pending || !assignee} onClick={() => runAction(() => assignSupportTicket(ticket.id, assignee), "Ticket assigned.")}>Assign</Button>
          </CardContent></Card>}

          {detail.capabilities.canEscalate && ticket.status === "in_progress" && <Card><CardHeader><CardTitle className="text-sm">Escalate ticket</CardTitle></CardHeader><CardContent>
            <form className="space-y-2" onSubmit={escalationForm.handleSubmit((values) => runAction(() => escalateSupportTicket(values), "Ticket escalated to the selected team."))}>
              <Select value={department} onValueChange={(value) => { setDepartment(value); setEscalationAssignee(""); escalationForm.setValue("department", value); escalationForm.setValue("assignedToUserId", ""); }}>
                <SelectTrigger><SelectValue placeholder="Destination department" /></SelectTrigger>
                <SelectContent>{detail.departments.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
              </Select>
              <FormError message={escalationForm.formState.errors.department?.message} />
              <Select value={escalationAssignee || "unassigned"} onValueChange={(value) => { const selected = value === "unassigned" ? "" : value; setEscalationAssignee(selected); escalationForm.setValue("assignedToUserId", selected); }}>
                <SelectTrigger><SelectValue placeholder="Optional officer" /></SelectTrigger>
                <SelectContent><SelectItem value="unassigned">Department queue</SelectItem>{detail.assignees.filter((employee) => employee.department === department).map((employee) => <SelectItem key={employee.userId} value={employee.userId}>{employee.name}</SelectItem>)}</SelectContent>
              </Select>
              <Textarea rows={3} maxLength={5000} disabled={pending} placeholder="Reason for escalation" {...escalationForm.register("reason")} />
              <FormError message={escalationForm.formState.errors.reason?.message} />
              <Button type="submit" variant="outline" className="w-full" disabled={pending}>Escalate Ticket</Button>
            </form>
          </CardContent></Card>}

          {ticket.status === "in_progress" && canWork && <Card><CardHeader><CardTitle className="text-sm">Resolve ticket</CardTitle></CardHeader><CardContent>
            <form className="space-y-2" onSubmit={resolutionForm.handleSubmit((values) => runAction(() => resolveSupportTicket(values), "Ticket marked resolved; trader has been notified."))}>
              <Label htmlFor="resolution-category">Resolution category</Label>
              <Select value={resolutionCategory} onValueChange={(value) => resolutionForm.setValue("category", value as ResolutionValues["category"], { shouldValidate: true })}>
                <SelectTrigger id="resolution-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="technical_issue">Technical issue</SelectItem>
                  <SelectItem value="transaction_issue">Transaction issue</SelectItem>
                  <SelectItem value="tax_clarification">Tax clarification</SelectItem>
                  <SelectItem value="account_issue">Account issue</SelectItem>
                  <SelectItem value="data_correction">Data correction</SelectItem>
                  <SelectItem value="compliance_issue">Compliance issue</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Textarea rows={4} minLength={10} maxLength={5000} disabled={pending} placeholder="Required resolution summary" {...resolutionForm.register("summary")} />
              <FormError message={resolutionForm.formState.errors.summary?.message} />
              <Button type="submit" className="w-full" disabled={pending}>Mark as Resolved</Button>
            </form>
          </CardContent></Card>}

          <div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" />Staff-only data is protected server-side.</div>
        </aside>
      </div>
    </div>
  );
}
