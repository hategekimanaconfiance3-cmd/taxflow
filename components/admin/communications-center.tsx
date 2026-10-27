"use client";

import { useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Mail, MessageSquare, Search, Send, Users } from "lucide-react";
import {
  markAdminCommunicationRead,
  submitAdminCommunication,
  submitAdminCommunicationReply,
  type CommunicationActionState,
  type getAdminCommunicationsPageData,
  type getCommunicationAdminDirectory,
} from "@/lib/actions/admin-communications.action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type PageData = Awaited<ReturnType<typeof getAdminCommunicationsPageData>>;
type Recipient = Awaited<ReturnType<typeof getCommunicationAdminDirectory>>[number];
const INITIAL_ACTION_STATE: CommunicationActionState = { success: false };
type SubmissionAttempt = { signature: string; key: string };

function retryKey(ref: { current: SubmissionAttempt | null }, signature: string) {
  if (!ref.current || ref.current.signature !== signature) ref.current = { signature, key: crypto.randomUUID() };
  return ref.current.key;
}

function dateTime(value: Date) {
  return new Intl.DateTimeFormat("en-RW", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Kigali" }).format(value);
}

export function CommunicationsCenter({ data, recipients }: { data: PageData; recipients: Recipient[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"direct" | "broadcast">("direct");
  const [recipientQuery, setRecipientQuery] = useState("");
  const [recipientStatus, setRecipientStatus] = useState<"all" | "active" | "inactive">("all");
  const [recipientRole, setRecipientRole] = useState("all");
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [allEligible, setAllEligible] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [readMessage, setReadMessage] = useState<string | null>(null);
  const sendAttempt = useRef<SubmissionAttempt | null>(null);
  const replyAttempt = useRef<SubmissionAttempt | null>(null);

  const filteredRecipients = useMemo(() => {
    const query = recipientQuery.trim().toLowerCase();
    return recipients.filter((recipient) => {
      const statusMatches = recipientStatus === "all" || (recipientStatus === "active" ? recipient.eligible : !recipient.eligible);
      const roleMatches = recipientRole === "all" || recipient.role.split(", ").includes(recipientRole);
      const searchMatches = !query || [recipient.name, recipient.email, recipient.staffId, recipient.role].some((field) => field.toLowerCase().includes(query));
      return statusMatches && roleMatches && searchMatches;
    });
  }, [recipientQuery, recipientRole, recipientStatus, recipients]);
  const roleOptions = [...new Set(recipients.flatMap((recipient) => recipient.role.split(", ")))].sort();
  const eligibleRecipients = recipients.filter((recipient) => recipient.eligible);
  const selectedRecipients = allEligible ? eligibleRecipients : eligibleRecipients.filter((recipient) => selectedRecipientIds.includes(recipient.userId));
  const recipientCount = selectedRecipients.length;
  const confirmationPhrase = allEligible ? "SEND TO ALL" : "SEND BROADCAST";
  const latestMessage = data.thread?.messages.at(-1);
  const isSender = data.thread?.conversation.createdBy === data.actorId;
  const canSubmit = !pending && (mode === "direct"
    ? selectedRecipientIds.length === 1 && !allEligible
    : recipientCount > 0 && confirmationText === confirmationPhrase);

  function toggleRecipient(userId: string) {
    setAllEligible(false);
    setSelectedRecipientIds((current) => {
      if (mode === "direct") return current.includes(userId) ? [] : [userId];
      return current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId];
    });
  }

  function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    const form = new FormData(event.currentTarget);
    form.set("mode", mode);
    form.set("recipientIds", JSON.stringify(allEligible ? eligibleRecipients.map((recipient) => recipient.userId) : selectedRecipientIds));
    form.set("allEligible", String(allEligible));
    form.set("confirmationText", confirmationText);
    const signature = JSON.stringify([mode, form.get("subject"), form.get("body"), form.get("priority"), selectedRecipientIds, allEligible, confirmationText]);
    form.set("idempotencyKey", retryKey(sendAttempt, signature));
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await submitAdminCommunication(INITIAL_ACTION_STATE, form);
      if (!result.success || !result.conversationId) {
        setError(result.error ?? "Message could not be sent.");
        return;
      }
      setSuccess("Message sent and saved to the recipients’ TaxFlow inboxes.");
      sendAttempt.current = null;
      setSelectedRecipientIds([]);
      setAllEligible(false);
      setConfirmationText("");
      router.push(`/admin/communications?conversationId=${encodeURIComponent(result.conversationId)}`);
      router.refresh();
    });
  }

  function handleReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("conversationId", data.thread?.conversation.id ?? "");
    const signature = JSON.stringify([data.thread?.conversation.id, form.get("body")]);
    form.set("idempotencyKey", retryKey(replyAttempt, signature));
    setError(null);
    startTransition(async () => {
      const result = await submitAdminCommunicationReply(INITIAL_ACTION_STATE, form);
      if (!result.success) {
        setError(result.error ?? "Reply could not be sent.");
        return;
      }
      setSuccess("Reply sent.");
      replyAttempt.current = null;
      router.refresh();
    });
  }

  function handleMarkRead() {
    if (!data.thread) return;
    setReadMessage(null);
    startTransition(async () => {
      const result = await markAdminCommunicationRead(data.thread!.conversation.id);
      if (!result.success) setError(result.error ?? "Read status could not be updated.");
      else {
        setReadMessage("Marked as read.");
        router.refresh();
      }
    });
  }

  return <main className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">TaxFlow · RRA</p><h1 className="mt-2 text-2xl font-semibold">Communications</h1><p className="mt-1 text-sm text-muted-foreground">Private staff messages and administrator broadcasts.</p></div>
      <div className="flex items-center gap-2"><Badge variant="outline">{data.unreadTotal} unread in this view</Badge>{data.canSend && <a className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground" href="#new-message"><Mail className="size-4" />New message</a>}</div>
    </header>

    {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}
    {success && <p role="status" className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700">{success}</p>}

    {data.canSend && <Card id="new-message">
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Send className="size-4" />New message</CardTitle><CardDescription>Only Super Admins can start administrator messages or broadcasts. Messages are stored in the database and recipient inboxes.</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={handleSend} className="space-y-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Message mode">
            <Button type="button" variant={mode === "direct" ? "default" : "outline"} onClick={() => { setMode("direct"); setAllEligible(false); setSelectedRecipientIds((current) => current.slice(0, 1)); setConfirmationText(""); }}>Direct message</Button>
            <Button type="button" variant={mode === "broadcast" ? "default" : "outline"} onClick={() => { setMode("broadcast"); setConfirmationText(""); }}>Broadcast</Button>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(18rem,0.9fr)_minmax(24rem,1.1fr)]">
            <section className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">Recipients</h2><Badge variant="secondary">{recipientCount} selected</Badge></div>
              <label className="relative block"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input value={recipientQuery} onChange={(event) => setRecipientQuery(event.target.value)} className="pl-9" placeholder="Search name, email, staff ID, role" aria-label="Search eligible administrators" /></label>
              <label className="grid gap-1 text-xs text-muted-foreground">Role<select value={recipientRole} onChange={(event) => setRecipientRole(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm text-foreground"><option value="all">All roles</option>{roleOptions.map((role) => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}</select></label>
              <label className="grid gap-1 text-xs text-muted-foreground">Account status<select value={recipientStatus} onChange={(event) => setRecipientStatus(event.target.value as "all" | "active" | "inactive")} className="h-9 rounded-md border bg-background px-3 text-sm text-foreground"><option value="all">All account statuses</option><option value="active">Active and eligible</option><option value="inactive">Inactive and ineligible</option></select></label>
              {mode === "broadcast" && <label className="flex items-start gap-2 rounded-md bg-muted/40 p-3 text-sm"><input type="checkbox" checked={allEligible} onChange={(event) => { setAllEligible(event.target.checked); if (event.target.checked) setSelectedRecipientIds([]); setConfirmationText(""); }} className="mt-1" /><span><span className="font-medium">All eligible administrators</span><span className="block text-xs text-muted-foreground">Currently {eligibleRecipients.length} active admin accounts, excluding you.</span></span></label>}
              <div className="max-h-56 space-y-1 overflow-y-auto" aria-label="Eligible administrators">
                {filteredRecipients.map((recipient) => <label key={recipient.userId} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 hover:bg-muted/40">
                  <input type={mode === "direct" ? "radio" : "checkbox"} name="admin-recipient" checked={allEligible ? recipient.eligible : selectedRecipientIds.includes(recipient.userId)} disabled={allEligible || !recipient.eligible} onChange={() => toggleRecipient(recipient.userId)} className="mt-1" />
                  <span className="min-w-0 text-sm"><span className="block truncate font-medium">{recipient.name}</span><span className="block truncate text-xs text-muted-foreground">{recipient.staffId} · {recipient.email}</span><span className="block text-xs capitalize text-muted-foreground">{recipient.role.replaceAll("_", " ")} · {recipient.eligible ? "Active" : "Inactive — cannot receive"}</span></span>
                </label>)}
                {filteredRecipients.length === 0 && <p className="px-2 py-5 text-center text-sm text-muted-foreground">No eligible admins match that search.</p>}
              </div>
              {mode === "broadcast" && <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                <p className="font-semibold">Recipients who will receive this broadcast ({recipientCount})</p>
                <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto text-muted-foreground">{selectedRecipients.map((recipient) => <li key={recipient.userId}>{recipient.staffId} · {recipient.name} · {recipient.email}</li>)}</ul>
              </div>}
              {mode === "direct" && selectedRecipients.length > 0 && <p className="rounded-md border bg-muted/30 p-3 text-xs"><span className="font-semibold">Direct recipient:</span> {selectedRecipients.map((recipient) => `${recipient.staffId} · ${recipient.name} · ${recipient.email}`).join(", ")}</p>}
            </section>

            <section className="space-y-3">
              <label className="grid gap-1 text-sm font-medium">Subject<Input name="subject" maxLength={160} required placeholder="Message subject" /></label>
              <label className="grid gap-1 text-sm font-medium">Message<Textarea name="body" maxLength={10_000} required rows={8} placeholder="Write a clear, professional message…" /></label>
              <label className="grid max-w-xs gap-1 text-sm font-medium">Priority<select name="priority" defaultValue="normal" className="h-9 rounded-md border bg-background px-3 text-sm"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></label>
              {mode === "broadcast" && <label className="grid max-w-sm gap-1 text-sm font-medium">Type <code>{confirmationPhrase}</code> to confirm this broadcast<Input value={confirmationText} onChange={(event) => setConfirmationText(event.target.value)} autoComplete="off" /></label>}
              <Button type="submit" disabled={!canSubmit}>{pending ? "Sending…" : mode === "broadcast" ? `Send broadcast to ${recipientCount}` : "Send direct message"}</Button>
            </section>
          </div>
        </form>
      </CardContent>
    </Card>}

    <div className="grid gap-4 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(30rem,1.5fr)]">
      <Card className="min-w-0">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="size-4" />Inbox</CardTitle><CardDescription>Only conversations where you are a participant are shown.</CardDescription>
          <form method="get" className="flex gap-2"><Input name="query" defaultValue={data.query} placeholder="Search subjects and messages" aria-label="Search conversations" /><Button type="submit" variant="outline" size="icon" aria-label="Search"><Search className="size-4" /></Button></form>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.inbox.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{data.query ? "No conversations match your search." : "Your inbox is empty."}</p> : data.inbox.map((conversation) => <Link key={conversation.id} href={`/admin/communications?conversationId=${encodeURIComponent(conversation.id)}${data.query ? `&query=${encodeURIComponent(data.query)}` : ""}`} className={`block rounded-lg border p-3 transition-colors hover:bg-muted/40 ${data.thread?.conversation.id === conversation.id ? "border-primary bg-muted/30" : ""}`}>
            <div className="flex items-start justify-between gap-2"><span className="line-clamp-1 text-sm font-medium">{conversation.subject}</span>{conversation.unreadCount > 0 && <Badge>{conversation.unreadCount}</Badge>}</div>
            <div className="mt-1 flex items-center gap-2"><Badge variant="outline" className="text-[10px]">{conversation.kind}</Badge><Badge variant={conversation.priority === "high" ? "destructive" : "secondary"} className="text-[10px]">{conversation.priority}</Badge></div>
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{conversation.latestMessage?.body ?? "No messages"}</p><p className="mt-2 text-[10px] text-muted-foreground">{conversation.updatedAt ? dateTime(conversation.updatedAt) : dateTime(conversation.createdAt)}</p>
          </Link>)}
          <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground"><span>{data.total} conversations</span><div className="flex gap-2">{data.page > 0 && <Link className="underline" href={`?page=${data.page - 1}${data.query ? `&query=${encodeURIComponent(data.query)}` : ""}`}>Newer</Link>}{(data.page + 1) * 20 < data.total && <Link className="underline" href={`?page=${data.page + 1}${data.query ? `&query=${encodeURIComponent(data.query)}` : ""}`}>Older</Link>}</div></div>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        {!data.thread ? <CardContent className="flex min-h-80 flex-col items-center justify-center gap-3 text-center"><Users className="size-8 text-muted-foreground/50" /><p className="font-medium">Choose a conversation</p><p className="max-w-sm text-sm text-muted-foreground">Messages and conversations are accessible only to their authorized participants.</p></CardContent> : <>
          <CardHeader className="border-b"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="text-lg">{data.thread.conversation.subject}</CardTitle><CardDescription className="mt-1">{data.thread.conversation.kind === "broadcast" ? "Broadcast · replies are private and disabled on shared broadcasts" : "Private direct conversation"} · {dateTime(data.thread.conversation.createdAt)}</CardDescription></div><div className="flex items-center gap-2"><Badge variant={data.thread.conversation.priority === "high" ? "destructive" : "outline"}>{data.thread.conversation.priority}</Badge><Button type="button" variant="outline" size="sm" onClick={handleMarkRead} disabled={pending}><Check className="size-4" />Mark read</Button></div></div>
            {data.thread.participants.length > 1 && <p className="text-xs text-muted-foreground">{data.thread.conversation.kind === "broadcast" && !isSender ? "From " : "Participants: "}{data.thread.participants.filter((participant) => participant.userId !== data.actorId).map((participant) => `${participant.name}${participant.staffId ? ` (${participant.staffId})` : ""}`).join(", ")}</p>}
            {data.thread.broadcastRecipientCount !== null && data.thread.broadcastRecipientCount !== undefined && <p className="text-xs text-muted-foreground">Read by {data.thread.broadcastReadCount ?? 0} of {data.thread.broadcastRecipientCount} recipients</p>}
            {data.thread.otherReadAt && <p className="text-xs text-muted-foreground">Recipient last read: {dateTime(data.thread.otherReadAt)}</p>}
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            {readMessage && <p className="text-xs text-emerald-700" role="status">{readMessage}</p>}
            {data.thread.messageCount > 50 && <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Showing messages {(data.thread.page * 50) + 1}–{Math.min((data.thread.page + 1) * 50, data.thread.messageCount)} of {data.thread.messageCount}</span><div className="flex gap-3">{data.thread.page > 0 && <Link href={`?conversationId=${data.thread.conversation.id}&messagePage=${data.thread.page - 1}`}><ChevronLeft className="inline size-4" />Newer</Link>}{(data.thread.page + 1) * 50 < data.thread.messageCount && <Link href={`?conversationId=${data.thread.conversation.id}&messagePage=${data.thread.page + 1}`}><ChevronRight className="inline size-4" />Older</Link>}</div></div>}
            <div className="max-h-[34rem] space-y-3 overflow-y-auto" aria-live="polite">
              {data.thread.messages.length === 0 ? <p className="text-sm text-muted-foreground">No messages in this conversation.</p> : data.thread.messages.map((message) => <article key={message.id} className={`max-w-[90%] rounded-lg border p-3 ${message.senderId === data.actorId ? "ml-auto bg-primary/5" : "bg-muted/30"}`}><header className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold">{message.senderId === data.actorId ? "You" : message.senderName}</span><time className="text-[10px] text-muted-foreground">{dateTime(message.createdAt)}</time></header><p className="whitespace-pre-wrap break-words text-sm">{message.body}</p></article>)}
            </div>
            {data.thread.conversation.kind === "direct" ? <form onSubmit={handleReply} className="space-y-2 border-t pt-4"><label className="grid gap-1 text-sm font-medium">Reply<Textarea name="body" maxLength={10_000} required rows={3} placeholder="Write a private reply…" /></label><div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Replies are visible only to this conversation’s participants.</p><Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send reply"}</Button></div></form> : <p className="border-t pt-4 text-xs text-muted-foreground">Broadcast conversations are read-only. Start a direct message to reply privately.</p>}
            {latestMessage && isSender && data.thread.conversation.kind === "direct" && data.thread.otherReadAt && data.thread.otherReadAt >= latestMessage.createdAt && <p className="text-right text-[10px] text-muted-foreground">Seen</p>}
          </CardContent>
        </>}
      </Card>
    </div>
    {data.page > 0 && <Link href="/admin/communications" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to inbox</Link>}
  </main>;
}
