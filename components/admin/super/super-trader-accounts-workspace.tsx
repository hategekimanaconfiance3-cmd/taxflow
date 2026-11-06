'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { editSuperTraderAccount, getSuperTraderAccountHistory, manageSuperTraderAccount, searchSuperTraderAccounts, type TraderAccountRecord } from '@/lib/actions/super-trader-account.action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type HistoryRow = { id: string; actorId: string; action: string; metadata: string | null; beforeState: Record<string, unknown> | null; afterState: Record<string, unknown> | null; createdAt: Date };
type AccountAction = 'approve' | 'reject' | 'under_review' | 'suspend' | 'restore' | 'activate' | 'deactivate' | 'delete';
const titleCase = (value: string) => value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
function availableAccountActions(account: TraderAccountRecord): [AccountAction, string][] {
  const actions: [AccountAction, string][] = [['approve', 'Approve'], ['reject', 'Reject'], ['under_review', 'Mark under review']];
  if (!(account.clearanceStatus === 'suspended' && !account.isActive)) actions.push(['suspend', 'Suspend']);
  if (account.isActive) actions.push(['deactivate', 'Deactivate'], ['delete', 'Delete account']);
  else {
    actions.push(['restore', 'Restore']);
    if (!['suspended', 'rejected'].includes(account.clearanceStatus)) actions.push(['activate', 'Activate']);
  }
  return actions;
}

export function SuperTraderAccountsWorkspace({ initialAccounts, initialHistory, initialError }: { initialAccounts: TraderAccountRecord[]; initialHistory: HistoryRow[]; initialError: string | null }) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [selected, setSelected] = useState<TraderAccountRecord | null>(initialAccounts[0] ?? null);
  const [history, setHistory] = useState<HistoryRow[]>(initialHistory);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState(initialError ?? '');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function loadHistory(account: TraderAccountRecord | null) {
    setSelected(account);
    setHistory([]);
    if (!account) return;
    const result = await getSuperTraderAccountHistory({ traderId: account.id });
    if (result.success) setHistory(result.data);
    else setMessage(result.error);
  }

  function search() {
    startTransition(async () => {
      setMessage('');
      const result = await searchSuperTraderAccounts({ search: query, role, status });
      if (!result.success) { setMessage(result.error); return; }
      setAccounts(result.data);
      await loadHistory(result.data.find((account) => account.id === selected?.id) ?? result.data[0] ?? null);
    });
  }

  function saveProfile(formData: FormData) {
    if (!selected) return;
    startTransition(async () => {
      setMessage('');
      const result = await editSuperTraderAccount({
        traderId: selected.id, name: String(formData.get('name') ?? ''), businessName: String(formData.get('businessName') ?? ''),
        email: String(formData.get('email') ?? ''), phoneNumber: String(formData.get('phoneNumber') ?? ''),
        businessType: String(formData.get('businessType') ?? ''), reason,
      });
      if (!result.success) { setMessage(result.error); return; }
      setMessage('Account details saved and audit logged.');
      setReason('');
      router.refresh();
      const refreshed = await searchSuperTraderAccounts({ search: query, role, status });
      if (refreshed.success) { setAccounts(refreshed.data); await loadHistory(refreshed.data.find((account) => account.id === selected.id) ?? null); }
    });
  }

  function applyAction(action: AccountAction) {
    if (!selected) return;
    if (reason.trim().length < 10) { setMessage('Enter a reason of at least 10 characters before applying this action.'); return; }
    const confirmation = action === 'delete'
      ? 'Soft-delete this trader account? It will be suspended, deactivated, and its sessions revoked.'
      : `Confirm ${titleCase(action).toLowerCase()} for ${selected.businessName || selected.name}?`;
    if (!window.confirm(confirmation)) return;
    startTransition(async () => {
      setMessage('');
      const traderId = selected.id;
      const result = await manageSuperTraderAccount({ traderId, action, reason });
      if (!result.success) { setMessage(result.error); return; }
      setMessage(`Account action “${titleCase(action)}” saved and audit logged.`);
      setReason('');
      const refreshed = await searchSuperTraderAccounts({ search: query, role, status });
      if (refreshed.success) { setAccounts(refreshed.data); await loadHistory(refreshed.data.find((account) => account.id === traderId) ?? null); }
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-semibold">Trader Account Management</h1><p className="text-sm text-muted-foreground">Manage manufacturer, wholesaler, and retailer accounts. Every change requires a reason and creates an audit record.</p></div>
      <Card><CardContent className="flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-64 flex-1 space-y-1"><Label htmlFor="account-search">Search trader</Label><Input id="account-search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') search(); }} placeholder="Name, business, email, or TIN" /></div>
        <div className="space-y-1"><Label htmlFor="account-role">Role</Label><select id="account-role" className="h-10 rounded-md border bg-background px-3 text-sm" value={role} onChange={(event) => setRole(event.target.value)}><option value="all">All trader roles</option><option value="manufacturer">Manufacturer</option><option value="wholesaler">Wholesaler</option><option value="retailer">Retailer</option></select></div>
        <div className="space-y-1"><Label htmlFor="account-status">Clearance</Label><select id="account-status" className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="under_review">Under review</option><option value="suspended">Suspended</option><option value="rejected">Rejected</option></select></div>
        <Button type="button" onClick={search} disabled={pending}>{pending ? 'Loading…' : 'Search'}</Button>
      </CardContent></Card>
      {message && <div role="status" className="rounded-md border px-4 py-3 text-sm">{message}</div>}
      <div className="grid gap-5 xl:grid-cols-[minmax(320px,0.85fr)_minmax(500px,1.5fr)]">
        <Card className="h-fit"><CardHeader><CardTitle className="text-base">Trader accounts ({accounts.length})</CardTitle></CardHeader><CardContent className="space-y-2">
          {accounts.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No trader accounts match these filters.</p> : accounts.map((account) => <button key={account.id} type="button" onClick={() => { setMessage(''); startTransition(() => { void loadHistory(account); }); }} className={`w-full rounded-md border p-3 text-left ${selected?.id === account.id ? 'border-primary bg-muted/50' : 'hover:bg-muted/30'}`}>
            <span className="flex items-start justify-between gap-2"><span className="font-medium">{account.businessName || account.name}</span><Badge variant="outline">{titleCase(account.clearanceStatus)}</Badge></span>
            <span className="mt-1 block text-xs text-muted-foreground">{account.name} · {titleCase(account.role)}{account.tinNumber ? ` · TIN ${account.tinNumber}` : ''}</span><span className="mt-1 block text-xs">{account.isActive ? 'Account active' : 'Account inactive'}</span>
          </button>)}
        </CardContent></Card>

        {selected ? <div className="space-y-5">
          <Card><CardHeader><CardTitle className="flex flex-wrap items-center justify-between gap-2"><span>{selected.businessName || selected.name}</span><span className="flex gap-2"><Badge variant="outline">{titleCase(selected.role)}</Badge><Badge variant={selected.isActive ? 'default' : 'destructive'}>{selected.isActive ? 'Active' : 'Inactive'}</Badge></span></CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 text-sm sm:grid-cols-2"><p><span className="text-muted-foreground">Account status:</span> {titleCase(selected.clearanceStatus)}</p><p><span className="text-muted-foreground">TIN:</span> {selected.tinNumber || 'Not recorded'}</p><p><span className="text-muted-foreground">Email:</span> {selected.email}</p><p><span className="text-muted-foreground">Phone:</span> {selected.phoneNumber || 'Not recorded'}</p><p><span className="text-muted-foreground">Business type:</span> {selected.businessType}</p><p><span className="text-muted-foreground">Registered:</span> {new Date(selected.createdAt).toLocaleString()}</p></div>
              <form action={saveProfile} className="space-y-3 border-t pt-4">
                <h2 className="font-medium">Edit account details</h2><p className="text-xs text-muted-foreground">TIN and national identity fields are protected identifiers and are not changed from this workflow.</p>
                <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label htmlFor="edit-name">Contact name</Label><Input key={`${selected.id}-name-${selected.updatedAt}`} id="edit-name" name="name" defaultValue={selected.name} maxLength={120} required /></div><div className="space-y-1"><Label htmlFor="edit-business">Business name</Label><Input key={`${selected.id}-business-${selected.updatedAt}`} id="edit-business" name="businessName" defaultValue={selected.businessName ?? ''} maxLength={160} /></div><div className="space-y-1"><Label htmlFor="edit-email">Email</Label><Input key={`${selected.id}-email-${selected.updatedAt}`} id="edit-email" name="email" type="email" defaultValue={selected.email} maxLength={320} required /></div><div className="space-y-1"><Label htmlFor="edit-phone">Phone</Label><Input key={`${selected.id}-phone-${selected.updatedAt}`} id="edit-phone" name="phoneNumber" defaultValue={selected.phoneNumber ?? ''} maxLength={40} /></div><div className="space-y-1 sm:col-span-2"><Label htmlFor="edit-type">Business type</Label><Input key={`${selected.id}-type-${selected.updatedAt}`} id="edit-type" name="businessType" defaultValue={selected.businessType} maxLength={80} required /></div></div>
                <Button type="submit" disabled={pending}>Save profile changes</Button>
              </form>
              <div className="space-y-3 border-t pt-4"><h2 className="font-medium">Account decisions</h2><p className="text-xs text-muted-foreground">Provide a reason (at least 10 characters) before applying a status or access change.</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{availableAccountActions(selected).map(([action, label]) => <Button key={action} type="button" variant={action === 'delete' || action === 'suspend' || action === 'reject' ? 'destructive' : 'outline'} disabled={pending} onClick={() => applyAction(action)}>{label}</Button>)}</div>
              </div>
              <div className="space-y-1"><Label htmlFor="account-reason">Administrative reason</Label><Textarea id="account-reason" value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={1000} rows={3} placeholder="Record why this profile change or account decision is necessary." /></div>
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle className="text-base">Account history</CardTitle></CardHeader><CardContent className="divide-y">
            {pending ? <p className="py-4 text-sm text-muted-foreground">Loading account history…</p> : history.length === 0 ? <p className="py-4 text-sm text-muted-foreground">No account audit events are recorded for this trader.</p> : history.map((event) => {
              let reasonText = '';
              try { const metadata: unknown = event.metadata ? JSON.parse(event.metadata) : null; if (metadata && typeof metadata === 'object' && 'reason' in metadata && typeof metadata.reason === 'string') reasonText = metadata.reason; } catch { reasonText = 'Audit metadata is unavailable.'; }
              return <div key={event.id} className="space-y-1 py-3"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium text-sm">{event.action.replaceAll('_', ' ')}</span><time className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</time></div><p className="text-xs text-muted-foreground">Actor ID: {event.actorId}</p>{reasonText && <p className="text-sm">Reason: {reasonText}</p>}<details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Before and after</summary><pre className="mt-2 overflow-auto rounded bg-muted p-2">{JSON.stringify({ before: event.beforeState, after: event.afterState }, null, 2)}</pre></details></div>;
            })}
          </CardContent></Card>
        </div> : <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Select a trader account to review its details, decisions, and history.</CardContent></Card>}
      </div>
    </div>
  );
}
