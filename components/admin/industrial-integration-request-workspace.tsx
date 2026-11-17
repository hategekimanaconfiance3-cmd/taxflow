'use client';

import { useState } from 'react';

interface RequestRow {
  request: { id: string; factoryId: string; environment: string; integrationName: string; requestedEquipmentIds: string[]; status: string; reviewNote: string | null; createdAt: string | Date };
  factory: { name: string; factoryCode: string; onboardingStatus: string; verificationStatus: string };
  equipment: Array<{ id: string; equipmentCode: string; name: string; operationalStatus: string }>;
}

export function IndustrialIntegrationRequestWorkspace({ initialRows }: { initialRows: RequestRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [integrationIds, setIntegrationIds] = useState<Record<string, string>>({});
  const [authorizedEquipment, setAuthorizedEquipment] = useState<Record<string, string[]>>(() => Object.fromEntries(initialRows.map((row) => [row.request.id, row.request.requestedEquipmentIds])));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function review(row: RequestRow, decision: 'approved' | 'rejected') {
    setBusyId(row.request.id); setMessage(null);
    try {
      const response = await fetch(`/api/admin/industrial/integration-requests/${row.request.id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, note: notes[row.request.id] ?? '', authorizedEquipmentIds: authorizedEquipment[row.request.id] ?? [] }) });
      const result: { result?: { request: { status: string }; integration?: { id: string } | null }; error?: string } = await response.json();
      if (!response.ok || !result.result) throw new Error(result.error ?? 'Integration review failed.');
      setRows((current) => current.map((item) => item.request.id === row.request.id ? { ...item, request: { ...item.request, status: result.result!.request.status, reviewNote: notes[row.request.id] ?? '' } } : item));
      if (result.result.integration) setIntegrationIds((current) => ({ ...current, [row.request.id]: result.result!.integration!.id }));
      setMessage(`Integration request ${decision}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Integration review failed.'); } finally { setBusyId(null); }
  }

  async function activate(row: RequestRow) {
    const integrationId = integrationIds[row.request.id];
    if (!integrationId) return;
    setBusyId(row.request.id); setMessage(null);
    try {
      const response = await fetch(`/api/admin/industrial/integrations/${integrationId}/activate`, { method: 'POST' });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Integration activation failed.');
      setMessage('Integration activated. Gateway authentication remains evidence-only and cannot post financial outcomes.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Integration activation failed.'); } finally { setBusyId(null); }
  }

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold tracking-tight">Industrial integration approvals</h1><p className="mt-1 text-sm text-muted-foreground">Approve factory-specific integrations, provision credentials, and activate only authorized equipment after factory verification.</p></div>
    {message && <div role="status" className="rounded-md border bg-muted/30 px-4 py-3 text-sm">{message}</div>}
    {rows.length === 0 ? <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">No integration requests are awaiting review.</div> : <div className="space-y-4">{rows.map((row) => <article key={row.request.id} className="rounded-lg border bg-card p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-semibold">{row.request.integrationName}</h2><p className="text-sm text-muted-foreground">{row.factory.factoryCode} · {row.factory.name} · {row.request.environment}</p></div><span className="rounded-full border px-3 py-1 text-xs capitalize">{row.request.status}</span></div><div className="mt-4 grid gap-3 text-sm sm:grid-cols-4"><div><span className="text-muted-foreground">Factory approval</span><p className="capitalize">{row.factory.onboardingStatus}</p></div><div><span className="text-muted-foreground">Verification</span><p className="capitalize">{row.factory.verificationStatus}</p></div><div><span className="text-muted-foreground">Equipment requested</span><p>{row.request.requestedEquipmentIds.length}</p></div><div><span className="text-muted-foreground">Submitted</span><p>{new Date(row.request.createdAt).toLocaleString()}</p></div></div>{['requested', 'under_review'].includes(row.request.status) && <div className="mt-5 grid gap-3"><fieldset className="grid gap-2 text-sm"><legend className="font-medium">Equipment authorization</legend>{row.equipment.map((item) => <label key={item.id} className="flex items-center gap-2"><input type="checkbox" checked={(authorizedEquipment[row.request.id] ?? []).includes(item.id)} onChange={(event) => setAuthorizedEquipment((current) => ({ ...current, [row.request.id]: event.target.checked ? [...(current[row.request.id] ?? []), item.id] : (current[row.request.id] ?? []).filter((id) => id !== item.id) }))} />{item.equipmentCode} — {item.name} <span className="text-muted-foreground">({item.operationalStatus})</span></label>)}</fieldset><div className="grid gap-3 md:grid-cols-[1fr_auto]"><label className="grid gap-1 text-sm">Review note<input required maxLength={2000} value={notes[row.request.id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [row.request.id]: event.target.value }))} className="h-10 rounded-md border bg-background px-3" placeholder="Confirm factory, equipment and environment evidence" /></label><div className="flex flex-wrap items-end gap-2"><button disabled={busyId === row.request.id || !(notes[row.request.id] ?? '').trim() || (authorizedEquipment[row.request.id] ?? []).length === 0} onClick={() => review(row, 'approved')} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">Approve and provision</button><button disabled={busyId === row.request.id || !(notes[row.request.id] ?? '').trim()} onClick={() => review(row, 'rejected')} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">Reject</button></div></div></div>}{integrationIds[row.request.id] && row.request.status === 'approved' && <button disabled={busyId === row.request.id} onClick={() => activate(row)} className="mt-4 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Activate integration</button>}{row.request.reviewNote && <p className="mt-4 text-sm text-muted-foreground">Latest note: {row.request.reviewNote}</p>}</article>)}</div>}
  </div>;
}
