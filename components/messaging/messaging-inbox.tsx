'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/lib/socket-client';
import { Archive, ArrowLeft, CheckCheck, Loader2, MessageSquare, Plus, Search, Send, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { translate } from '@/lib/language';
import { useLanguagePreference } from '@/lib/use-language';
import { isRRARole } from '@/lib/rra-rbac';
import { MESSAGE_CATEGORIES, type MessageCategory, type MessagingRouteRule } from '@/lib/messaging/routing';
import {
  archiveMessageConversation,
  assignMessageConversation,
  correctMessageRouting,
  createTaxpayerConversation,
  getMyConversationMessages,
  getRRAConversationMessages,
  getRRAStaffRecipientsForCase,
  getUnreadMessageCount,
  listMyConversations,
  listRRAConversations,
  replyToConversation,
  resolveMessageConversation,
  searchRRAStaff,
  searchTaxpayerRecipients,
  saveMessagingRoutingSettings,
  startStaffConversation,
  startStaffTaxpayerConversation,
} from '@/lib/actions/messaging.action';

type ConversationRow = {
  id: string; subject: string; category: string; status: string; priority: string; threadType: string;
  updatedAt: Date; createdAt: Date; traderId: string | null; traderName: string | null;
  assignedToId: string | null; routingReason: string | null; lastMessage: string; lastMessageAt: Date; unreadCount: number;
};
type MessageRow = { id: string; senderUserId: string; senderName: string; senderType: string; senderRole: string; body: string; createdAt: Date };
type StaffRecipient = { userId: string; name: string; staffId: string; department: string | null; role: string };
type TaxpayerRecipient = { userId: string; name: string; businessName: string | null; tin: string | null; role: string };

const CATEGORY_LABELS: Record<MessageCategory, string> = {
  tax_declaration: 'Tax declaration', tin_registration: 'TIN and registration', vat_invoice: 'VAT and invoices',
  tax_payment: 'Tax payments', production: 'Production and manufacturing', inventory_transactions: 'Inventory and transactions',
  imports: 'Imports and customs', dispute_assessment: 'Disputes and assessments', account_access: 'Account access and technical support', general: 'General inquiry',
};
const STATUS_LABELS: Record<string, string> = {
  open: 'Open', awaiting_staff: 'Awaiting staff', awaiting_user: 'Awaiting user', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed',
};
const STATUS_COLORS: Record<string, string> = {
  open: 'bg-amber-100 text-amber-800', awaiting_staff: 'bg-amber-100 text-amber-800',
  awaiting_user: 'bg-blue-100 text-blue-800', in_progress: 'bg-blue-100 text-blue-800',
  resolved: 'bg-emerald-100 text-emerald-800', closed: 'bg-zinc-100 text-zinc-700',
};

function categoryLabel(category: string, lang: ReturnType<typeof useLanguagePreference>[0]): string {
  const value = CATEGORY_LABELS[category as MessageCategory] ?? category.replaceAll('_', ' ');
  return translate(value, lang);
}

function statusLabel(status: string, lang: ReturnType<typeof useLanguagePreference>[0]): string {
  return translate(STATUS_LABELS[status] ?? status.replaceAll('_', ' '), lang);
}

function formatTime(value: Date): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function MessagingInbox({
  audience,
  initialConversations,
  canContactTaxpayers = false,
  canManageCases = false,
  routingRules,
  currentUserId,
  initialConversationId,
}: {
  audience: 'trader' | 'rra';
  initialConversations: ConversationRow[];
  canContactTaxpayers?: boolean;
  canManageCases?: boolean;
  routingRules?: MessagingRouteRule[] | null;
  currentUserId: string;
  initialConversationId?: string;
}) {
  const router = useRouter();
  const [lang] = useLanguagePreference();
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(
    initialConversationId && initialConversations.some((row) => row.id === initialConversationId)
      ? initialConversationId
      : initialConversations[0]?.id ?? null,
  );
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [isPending, startTransition] = useTransition();
  const [showComposer, setShowComposer] = useState(false);
  const [composerMode, setComposerMode] = useState<'user' | 'staff' | 'taxpayer'>(audience === 'rra' ? 'staff' : 'user');
  const [listSearch, setListSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'in_progress' | 'awaiting_user' | 'awaiting_staff' | 'resolved' | 'closed'>('all');
  const [unreadTotal, setUnreadTotal] = useState(initialConversations.reduce((total, row) => total + row.unreadCount, 0));
  const replyIdRef = useRef<string | null>(null);
  const active = conversations.find((row) => row.id === activeId) ?? null;

  const refreshConversations = useCallback(async () => {
    try {
      const [rows, count] = await Promise.all([
        audience === 'trader'
          ? listMyConversations({ search: listSearch, status: statusFilter })
          : listRRAConversations({ search: listSearch, status: statusFilter }),
        getUnreadMessageCount(),
      ]);
      setConversations(rows as ConversationRow[]);
      setUnreadTotal(count);
      if (activeId && !(rows as ConversationRow[]).some((row) => row.id === activeId)) setActiveId(null);
    } catch {
      // Keep the current list visible; the next explicit refresh can retry.
    }
  }, [activeId, audience, listSearch, statusFilter]);

  const refreshMessages = useCallback(async (ticketId: string) => {
    setLoadingMessages(true);
    setError('');
    try {
      const rows = audience === 'trader'
        ? await getMyConversationMessages({ ticketId })
        : await getRRAConversationMessages({ ticketId });
      setMessages(rows as MessageRow[]);
      await refreshConversations();
    } catch (cause) {
      setMessages([]);
      setError(cause instanceof Error ? translate(cause.message, lang) : translate('Unable to load this conversation.', lang));
    } finally {
      setLoadingMessages(false);
    }
  }, [audience, lang, refreshConversations]);

  useSocket(currentUserId, {
    message: () => {
      void refreshConversations();
      if (activeId) void refreshMessages(activeId);
    },
  });

  useEffect(() => {
    const timer = window.setInterval(() => void refreshConversations(), 30_000);
    return () => window.clearInterval(timer);
  }, [refreshConversations]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshConversations(), 250);
    return () => window.clearTimeout(timer);
  }, [refreshConversations]);

  useEffect(() => {
    if (activeId) void refreshMessages(activeId);
    else setMessages([]);
  }, [activeId, refreshMessages]);

  useEffect(() => setConversations(initialConversations), [initialConversations]);

  function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeId || !reply.trim() || isPending) return;
    replyIdRef.current ??= crypto.randomUUID();
    const messageId = replyIdRef.current;
    setError('');
    startTransition(async () => {
      try {
        await replyToConversation({ ticketId: activeId, body: reply, clientMessageId: messageId });
        replyIdRef.current = null;
        setReply('');
        await refreshMessages(activeId);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? translate(cause.message, lang) : translate('Unable to send this message.', lang));
      }
    });
  }

  function archiveActive() {
    if (!activeId || isPending) return;
    startTransition(async () => {
      try {
        await archiveMessageConversation(activeId);
        setActiveId(null);
        await refreshConversations();
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? translate(cause.message, lang) : translate('Unable to archive this conversation.', lang));
      }
    });
  }

  const categories = useMemo(() => MESSAGE_CATEGORIES.map((value) => ({ value, label: categoryLabel(value, lang) })), [lang]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{translate(audience === 'trader' ? 'My Messages' : 'Staff Inbox', lang)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {translate(audience === 'trader' ? 'The original message is kept in its written language.' : 'Review and route messages within your authorized role and department.', lang)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{translate('Unread', lang)}: {unreadTotal}</Badge>
          <Button onClick={() => { setComposerMode(audience === 'rra' ? 'staff' : 'user'); setShowComposer(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> {translate('New Message', lang)}
          </Button>
        </div>
      </header>

      {showComposer && (
        <ComposeMessage
          audience={audience}
          mode={composerMode}
          canContactTaxpayers={canContactTaxpayers}
          categories={categories}
          onModeChange={setComposerMode}
          onCancel={() => setShowComposer(false)}
          onCreated={async (id) => {
            setShowComposer(false);
            await refreshConversations();
            setActiveId(id);
            router.refresh();
          }}
        />
      )}

      {routingRules && canManageCases && (
        <RoutingSettings rules={routingRules} />
      )}

      <div className="grid min-h-[620px] gap-4 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.6fr)]">
        <Card className="min-h-0 overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-4 w-4" />{translate('Conversations', lang)}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => void refreshConversations()}>{translate('Refresh', lang)}</Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Input value={listSearch} onChange={(event) => setListSearch(event.target.value)} placeholder={translate('Search conversations', lang)} maxLength={120} />
              <select aria-label={translate('Filter by status', lang)} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="h-10 rounded-md border bg-background px-2 text-sm">
                {(['all', 'open', 'in_progress', 'awaiting_staff', 'awaiting_user', 'resolved', 'closed'] as const).map((status) => (
                  <option key={status} value={status}>{status === 'all' ? translate('All statuses', lang) : statusLabel(status, lang)}</option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent className="max-h-[70vh] space-y-2 overflow-y-auto p-3 pt-0">
            {conversations.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">{translate('No conversations found', lang)}</p>
            ) : conversations.map((row) => (
              <button key={row.id} onClick={() => { setActiveId(row.id); setShowComposer(false); }}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${activeId === row.id ? 'border-primary bg-accent/50' : 'hover:bg-accent/30'}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="line-clamp-1 text-sm font-semibold">{row.subject}</span>
                  {row.unreadCount > 0 && <Badge className="shrink-0">{row.unreadCount}</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {audience === 'rra' ? row.threadType === 'staff' ? translate('Internal RRA conversation', lang) : row.traderName ?? 'TaxFlow user' : row.assignedToId ? translate('Assigned to an RRA officer', lang) : translate('RRA review queue', lang)}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{row.lastMessage}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <Badge variant="outline" className="max-w-[65%] truncate text-[10px]">{categoryLabel(row.category, lang)}</Badge>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{formatTime(row.lastMessageAt)}</span>
                </div>
                <Badge variant="secondary" className={`mt-2 text-[10px] ${STATUS_COLORS[row.status] ?? ''}`}>{statusLabel(row.status, lang)}</Badge>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden">
          {!active ? (
            <CardContent className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <MessageSquare className="h-9 w-9 opacity-30" />
              <p className="text-sm">{translate('Choose a conversation to read and reply.', lang)}</p>
            </CardContent>
          ) : (
            <>
              <CardHeader className="border-b pb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-base">{active.subject}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {audience === 'rra' ? active.threadType === 'staff' ? translate('This is an internal RRA conversation. Taxpayers cannot see it.', lang) : `${active.traderName ?? 'TaxFlow user'} · ${categoryLabel(active.category, lang)}` : `${categoryLabel(active.category, lang)} · ${statusLabel(active.status, lang)}`}
                    </p>
                    {active.routingReason && audience === 'rra' && <p className="mt-1 text-xs text-muted-foreground">{translate('Routing', lang)}: {active.routingReason}</p>}
                  </div>
                  <Button variant="outline" size="sm" className="gap-2" onClick={archiveActive} disabled={isPending}>
                    <Archive className="h-3.5 w-3.5" /> {translate('Archive conversation', lang)}
                  </Button>
                </div>
              </CardHeader>

              {audience === 'rra' && active.threadType === 'taxpayer' && canManageCases && (
                <CaseControls key={active.id} conversation={active} onUpdated={refreshConversations} />
              )}

              <div className="flex min-h-[300px] flex-1 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
                {loadingMessages ? <div className="flex flex-1 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
                  <>
                    {messages.length === 50 && <Button variant="ghost" size="sm" className="self-center" onClick={async () => {
                      try {
                        const older = audience === 'trader'
                          ? await getMyConversationMessages({ ticketId: active.id, before: messages[0]?.createdAt.toISOString() })
                          : await getRRAConversationMessages({ ticketId: active.id, before: messages[0]?.createdAt.toISOString() });
                        setMessages((current) => [...older as MessageRow[], ...current]);
                      } catch { setError(translate('Unable to load earlier messages.', lang)); }
                    }}><ArrowLeft className="mr-1 h-3.5 w-3.5" />{translate('Load earlier messages', lang)}</Button>}
                    {messages.map((message) => {
                      const mine = message.senderUserId === currentUserId;
                      return (
                        <div key={message.id} className={`max-w-[85%] rounded-xl p-3 text-sm ${mine ? 'ml-auto bg-foreground text-background' : 'bg-muted'}`}>
                          <div className="mb-1 flex items-center justify-between gap-4 text-[11px] opacity-70">
                            <span>{mine ? translate('You', lang) : `${message.senderName} · ${message.senderRole.replaceAll('_', ' ')}`}</span>
                            <time dateTime={new Date(message.createdAt).toISOString()}>{formatTime(message.createdAt)}</time>
                          </div>
                          <p className="whitespace-pre-wrap break-words">{message.body}</p>
                        </div>
                      );
                    })}
                    {messages.length === 0 && <p className="m-auto text-sm text-muted-foreground">{translate('No messages yet', lang)}</p>}
                  </>
                )}
              </div>

              {error && <p role="alert" className="px-4 pb-2 text-sm text-destructive">{error}</p>}
              {active.status !== 'closed' && (
                <form onSubmit={sendReply} className="border-t p-3 sm:p-4">
                  <Label htmlFor="message-reply" className="sr-only">{translate('Reply', lang)}</Label>
                  <Textarea id="message-reply" value={reply} onChange={(event) => setReply(event.target.value)} maxLength={10_000}
                    placeholder={translate('Write a reply…', lang)} rows={3} required disabled={isPending} />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">{translate('Messages are retained in the conversation history.', lang)}</p>
                    <Button type="submit" size="sm" disabled={isPending || !reply.trim()} className="gap-2">
                      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      {translate('Send message', lang)}
                    </Button>
                  </div>
                </form>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function ComposeMessage({
  audience, mode, canContactTaxpayers, categories, onModeChange, onCancel, onCreated,
}: {
  audience: 'trader' | 'rra';
  mode: 'user' | 'staff' | 'taxpayer';
  canContactTaxpayers: boolean;
  categories: Array<{ value: MessageCategory; label: string }>;
  onModeChange: (mode: 'user' | 'staff' | 'taxpayer') => void;
  onCancel: () => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const [lang] = useLanguagePreference();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<MessageCategory>('general');
  const [search, setSearch] = useState('');
  const [staffMatches, setStaffMatches] = useState<StaffRecipient[]>([]);
  const [taxpayerMatches, setTaxpayerMatches] = useState<TaxpayerRecipient[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<StaffRecipient[]>([]);
  const [selectedTaxpayer, setSelectedTaxpayer] = useState<TaxpayerRecipient | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const clientMessageId = useRef<string | null>(null);

  async function searchRecipient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      if (mode === 'staff') setStaffMatches(await searchRRAStaff(search));
      else if (mode === 'taxpayer') setTaxpayerMatches(await searchTaxpayerRecipients(search));
    } catch (cause) { setError(cause instanceof Error ? translate(cause.message, lang) : translate('Search failed.', lang)); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subject.trim() || !body.trim() || busy) return;
    if (mode === 'staff' && selectedStaff.length === 0) { setError(translate('Choose a recipient', lang)); return; }
    if (mode === 'taxpayer' && !selectedTaxpayer) { setError(translate('Choose a recipient', lang)); return; }
    clientMessageId.current ??= crypto.randomUUID();
    setBusy(true);
    setError('');
    try {
      let result: { success: true; id: string };
      if (audience === 'trader') {
        result = await createTaxpayerConversation({ category, subject, body, clientMessageId: clientMessageId.current });
      } else if (mode === 'staff') {
        result = await startStaffConversation({ recipientUserIds: selectedStaff.map((person) => person.userId), subject, body, clientMessageId: clientMessageId.current });
      } else if (mode === 'taxpayer' && selectedTaxpayer) {
        result = await startStaffTaxpayerConversation({ recipientUserId: selectedTaxpayer.userId, category, subject, body, clientMessageId: clientMessageId.current });
      } else {
        setError(translate('Choose a recipient', lang));
        return;
      }
      clientMessageId.current = null;
      await onCreated(result.id);
    } catch (cause) {
      setError(cause instanceof Error ? translate(cause.message, lang) : translate('Unable to send the message.', lang));
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">{translate(audience === 'trader' ? 'Message RRA' : mode === 'staff' ? 'New Staff Conversation' : 'Message Taxpayer', lang)}</CardTitle>
          {audience === 'rra' && <div className="flex flex-wrap gap-1">
            <Button variant={mode === 'staff' ? 'default' : 'outline'} size="sm" onClick={() => onModeChange('staff')}><Users className="mr-1 h-3.5 w-3.5" />{translate('RRA staff', lang)}</Button>
            {canContactTaxpayers && <Button variant={mode === 'taxpayer' ? 'default' : 'outline'} size="sm" onClick={() => onModeChange('taxpayer')}>{translate('Taxpayer', lang)}</Button>}
          </div>}
        </div>
      </CardHeader>
      <CardContent>
        {audience === 'rra' && (
          <div className="mb-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            {mode === 'staff' ? translate('This is an internal RRA conversation. Taxpayers cannot see it.', lang) : translate('Taxpayer contact requires the taxpayer search permission and support authorization.', lang)}
          </div>
        )}
        {audience === 'rra' && (
          <form onSubmit={searchRecipient} className="mb-4 space-y-2">
            <Label htmlFor="recipient-search">{translate(mode === 'staff' ? 'Search staff' : 'Search taxpayer by name, business, or TIN', lang)}</Label>
            <div className="flex gap-2">
              <Input id="recipient-search" value={search} onChange={(event) => setSearch(event.target.value)} minLength={2} maxLength={100} />
              <Button type="submit" variant="outline"><Search className="mr-1 h-4 w-4" />{translate('Search', lang)}</Button>
            </div>
            {(mode === 'staff' ? staffMatches.length > 0 : taxpayerMatches.length > 0) && (
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border p-2">
                {mode === 'staff' ? staffMatches.map((person) => (
                  <button key={person.userId} type="button" onClick={() => setSelectedStaff((items) => items.some((item) => item.userId === person.userId) ? items : [...items, person])}
                    className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent">
                    {person.name} · {person.role}{person.department ? ` · ${person.department}` : ''}
                  </button>
                )) : taxpayerMatches.map((person) => (
                  <button key={person.userId} type="button" onClick={() => setSelectedTaxpayer(person)}
                    className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent">
                    {person.businessName ?? person.name}{person.tin ? ` · TIN ${person.tin}` : ''} · {person.role}
                  </button>
                ))}
              </div>
            )}
            {selectedStaff.length > 0 && <p className="text-xs text-muted-foreground">{selectedStaff.map((person) => person.name).join(', ')}</p>}
            {selectedTaxpayer && <p className="text-xs text-muted-foreground">{selectedTaxpayer.businessName ?? selectedTaxpayer.name} · {selectedTaxpayer.tin ?? selectedTaxpayer.role}</p>}
          </form>
        )}
        <form onSubmit={submit} className="space-y-3">
          {(audience === 'trader' || mode === 'taxpayer') && (
            <div className="space-y-1.5">
              <Label htmlFor="message-category">{translate('Choose category', lang)}</Label>
              <select id="message-category" value={category} onChange={(event) => setCategory(event.target.value as MessageCategory)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                {categories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="message-subject">{translate('Conversation subject', lang)}</Label>
            <Input id="message-subject" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="message-body">{translate('Message', lang)}</Label>
            <Textarea id="message-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={10_000} rows={5} required />
            <p className="text-right text-[11px] text-muted-foreground">{body.length}/10,000</p>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>{translate('Cancel', lang)}</Button>
            <Button type="submit" disabled={busy || !subject.trim() || !body.trim()} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{translate('Send message', lang)}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function CaseControls({ conversation, onUpdated }: { conversation: ConversationRow; onUpdated: () => Promise<void> }) {
  const [lang] = useLanguagePreference();
  const [staff, setStaff] = useState<StaffRecipient[]>([]);
  const [selectedStaff, setSelectedStaff] = useState(conversation.assignedToId ?? '');
  const [category, setCategory] = useState<MessageCategory>(
    MESSAGE_CATEGORIES.includes(conversation.category as MessageCategory) ? conversation.category as MessageCategory : 'general',
  );
  const [reason, setReason] = useState('');
  const [resolution, setResolution] = useState('');
  const [routingReason, setRoutingReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getRRAStaffRecipientsForCase(conversation.id).then(setStaff).catch(() => setStaff([]));
  }, [conversation.id]);

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStaff || !reason.trim()) return;
    setBusy(true); setError('');
    try {
      await assignMessageConversation({ ticketId: conversation.id, staffUserId: selectedStaff, reason });
      setReason('');
      await onUpdated();
    } catch (cause) { setError(cause instanceof Error ? translate(cause.message, lang) : translate('Assignment failed.', lang)); }
    finally { setBusy(false); }
  }

  async function resolve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resolution.trim()) return;
    setBusy(true); setError('');
    try { await resolveMessageConversation({ ticketId: conversation.id, resolution }); await onUpdated(); }
    catch (cause) { setError(cause instanceof Error ? translate(cause.message, lang) : translate('Resolution failed.', lang)); }
    finally { setBusy(false); }
  }

  async function correctRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!routingReason.trim()) return;
    setBusy(true); setError('');
    try {
      await correctMessageRouting({ ticketId: conversation.id, category, reason: routingReason });
      setRoutingReason('');
      await onUpdated();
    } catch (cause) { setError(cause instanceof Error ? translate(cause.message, lang) : translate('Routing correction failed.', lang)); }
    finally { setBusy(false); }
  }

  return (
    <div className="grid gap-3 border-b bg-muted/20 p-3 sm:grid-cols-2">
      <form onSubmit={correctRoute} className="space-y-2 sm:col-span-2">
        <Label htmlFor="message-category-correction">{translate('Correct message category', lang)}</Label>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
          <select id="message-category-correction" value={category} onChange={(event) => setCategory(event.target.value as MessageCategory)} className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm">
            {MESSAGE_CATEGORIES.map((value) => <option key={value} value={value}>{categoryLabel(value, lang)}</option>)}
          </select>
          <Input value={routingReason} onChange={(event) => setRoutingReason(event.target.value)} placeholder={translate('Explain the routing correction', lang)} maxLength={500} required />
          <Button type="submit" size="sm" variant="outline" disabled={busy || !routingReason.trim()}>{translate('Update routing', lang)}</Button>
        </div>
      </form>
      {staff.length > 0 && <form onSubmit={assign} className="space-y-2">
        <Label htmlFor="message-assignee">{translate('Assign to officer', lang)}</Label>
        <select id="message-assignee" value={selectedStaff} onChange={(event) => setSelectedStaff(event.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
          <option value="">{translate('Choose a recipient', lang)}</option>
          {staff.map((person) => <option key={person.userId} value={person.userId}>{person.name} · {person.role}</option>)}
        </select>
        <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={translate('Assignment reason', lang)} maxLength={500} required />
        <Button type="submit" size="sm" disabled={busy || !selectedStaff || !reason.trim()}>{translate('Assign to officer', lang)}</Button>
      </form>}
      {conversation.status !== 'resolved' && conversation.status !== 'closed' && <form onSubmit={resolve} className="space-y-2">
        <Label htmlFor="message-resolution">{translate('Resolve conversation', lang)}</Label>
        <Textarea id="message-resolution" value={resolution} onChange={(event) => setResolution(event.target.value)} maxLength={2_000} rows={2} required />
        <Button type="submit" size="sm" variant="outline" disabled={busy || !resolution.trim()}><CheckCheck className="mr-1 h-4 w-4" />{translate('Resolve conversation', lang)}</Button>
      </form>}
      {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
    </div>
  );
}

function RoutingSettings({ rules }: { rules: MessagingRouteRule[] }) {
  const [lang] = useLanguagePreference();
  const [current, setCurrent] = useState(rules);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    try { await saveMessagingRoutingSettings(current); setMessage(translate('Routing settings saved.', lang)); }
    catch (error) { setMessage(error instanceof Error ? translate(error.message, lang) : translate('Could not save routing settings.', lang)); }
    finally { setBusy(false); }
  }
  return (
    <details className="rounded-lg border bg-card p-4">
      <summary className="cursor-pointer text-sm font-semibold">{translate('Routing settings', lang)}</summary>
      <p className="mt-2 text-xs text-muted-foreground">{translate('Only a super administrator with system configuration permission can save category routing.', lang)}</p>
      <form onSubmit={save} className="mt-3 space-y-3">
        {current.map((rule, index) => (
          <div key={rule.category} className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_1fr_2fr]">
            <div className="text-sm font-medium">{translate(CATEGORY_LABELS[rule.category], lang)}</div>
            <Input value={rule.department ?? ''} placeholder={translate('Department (optional)', lang)} maxLength={100}
              onChange={(event) => setCurrent((value) => value.map((item, i) => i === index ? { ...item, department: event.target.value.trim() || null } : item))} />
            <Input value={rule.roles.join(', ')} aria-label={`${translate('Routing roles', lang)}: ${rule.category}`}
              onChange={(event) => setCurrent((value) => value.map((item, i) => i === index ? {
                ...item,
                roles: event.target.value.split(',').map((role) => role.trim()).filter(isRRARole),
              } : item))} />
          </div>
        ))}
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
        <Button size="sm" type="submit" disabled={busy}>{busy ? translate('Saving…', lang) : translate('Save routing settings', lang)}</Button>
      </form>
    </details>
  );
}
