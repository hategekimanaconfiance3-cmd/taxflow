'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface ToleranceRecipeOption {
  manufacturerId: string;
  manufacturerName: string;
  productId: string;
  productName: string;
  recipeVersionId: string;
  recipeCode: string;
  recipeVersion: number;
  materials: Array<{ materialId: string; materialCode: string; unit: string }>;
}

interface ToleranceStandardRow {
  id: string;
  manufacturerId: string;
  productName: string;
  recipeVersionId: string;
  recipeCode: string;
  recipeVersion: number;
  materialId: string | null;
  materialCode: string | null;
  materialUnit: string | null;
  toleranceType: string;
  version: number;
  toleranceBasisPoints: number;
  toleranceUnit: string;
  effectiveAt: string | Date;
  status: string;
  justification: string;
  evidenceReference: string;
  createdByUserId: string;
  createdAt: string | Date;
  approvedByUserId: string | null;
  approvedAt: string | Date | null;
  approvalNote: string | null;
  activatedByUserId: string | null;
  activatedAt: string | Date | null;
  activationNote: string | null;
  deactivatedByUserId: string | null;
  deactivatedAt: string | Date | null;
  deactivationNote: string | null;
}

interface GovernancePayload {
  recipes: ToleranceRecipeOption[];
  standards: ToleranceStandardRow[];
}

export function ProductionToleranceGovernance({ data }: { data: GovernancePayload }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [recipeVersionId, setRecipeVersionId] = useState('');
  const [toleranceType, setToleranceType] = useState<'yield' | 'material_consumption'>('yield');
  const [materialId, setMaterialId] = useState('');
  const [percentage, setPercentage] = useState('');
  const [effectiveAt, setEffectiveAt] = useState('');
  const [justification, setJustification] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const selectedRecipe = data.recipes.find((recipe) => recipe.recipeVersionId === recipeVersionId);
  const visibleMaterials = selectedRecipe?.materials ?? [];

  async function createDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(percentage);
    if (!Number.isFinite(value) || Math.round(value * 100) !== value * 100) {
      setMessage({ text: 'Enter a tolerance percentage with at most two decimal places.', error: true });
      return;
    }
    const parsedDate = new Date(effectiveAt);
    if (!effectiveAt || !Number.isFinite(parsedDate.getTime())) {
      setMessage({ text: 'Select the standard effective date and time.', error: true });
      return;
    }
    const response = await fetch('/api/admin/production/tolerances', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        recipeVersionId,
        toleranceType,
        ...(toleranceType === 'material_consumption' ? { materialId } : {}),
        toleranceBasisPoints: Math.round(value * 100),
        toleranceUnit: 'basis_points',
        effectiveAt: parsedDate.toISOString(),
        justification,
        evidenceReference,
      }),
    });
    const result = await response.json() as { error?: string; standard?: { version: number } };
    if (!response.ok || !result.standard) {
      setMessage({ text: result.error ?? 'Unable to save this tolerance draft.', error: true });
      return;
    }
    setMessage({ text: `Version ${result.standard.version} saved as a draft. It does not assess production until approved, activated, and effective.`, error: false });
    setPercentage('');
    setJustification('');
    setEvidenceReference('');
    router.refresh();
  }

  function transition(standard: ToleranceStandardRow, action: 'approve' | 'activate' | 'deactivate') {
    const note = decisionNotes[standard.id]?.trim() ?? '';
    if (note.length < 5) {
      setMessage({ text: 'Add a short decision note before changing a standard status.', error: true });
      return;
    }
    startTransition(async () => {
      const response = await fetch(`/api/admin/production/tolerances/${encodeURIComponent(standard.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, note }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        setMessage({ text: result.error ?? 'Unable to update this tolerance version.', error: true });
        return;
      }
      setMessage({ text: `Tolerance version ${action}d.`, error: false });
      router.refresh();
    });
  }

  return <div className="space-y-6">
    <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold">Create an official standard version</h2>
      <p className="mt-1 text-sm text-muted-foreground">Only Super Admin can create, approve, activate, or deactivate standards. No tolerance is prefilled; use a documented technical basis and evidence.</p>
      {message && <p role={message.error ? 'alert' : 'status'} className={`mt-3 text-sm ${message.error ? 'text-red-700' : 'text-emerald-700'}`}>{message.text}</p>}
      <form onSubmit={(event) => { startTransition(() => { void createDraft(event); }); }} className="mt-4 space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">Recipe and manufacturer
            <select value={recipeVersionId} required onChange={(event) => { setRecipeVersionId(event.target.value); setMaterialId(''); }} className="h-10 w-full rounded-md border bg-background px-3 font-normal">
              <option value="">Select recipe version</option>
              {data.recipes.map((recipe) => <option key={recipe.recipeVersionId} value={recipe.recipeVersionId}>{recipe.manufacturerName} · {recipe.productName} · {recipe.recipeCode} v{recipe.recipeVersion}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">Standard type
            <select value={toleranceType} onChange={(event) => { setToleranceType(event.target.value as 'yield' | 'material_consumption'); setMaterialId(''); }} className="h-10 w-full rounded-md border bg-background px-3 font-normal">
              <option value="yield">Finished-product yield</option>
              <option value="material_consumption">Material consumption</option>
            </select>
          </label>
          {toleranceType === 'material_consumption' && <label className="space-y-1 text-sm font-medium">Protected material code and unit
            <select value={materialId} required onChange={(event) => setMaterialId(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 font-normal">
              <option value="">Select material</option>
              {visibleMaterials.map((material) => <option key={material.materialId} value={material.materialId}>{material.materialCode} · {material.unit}</option>)}
            </select>
          </label>}
          <label className="space-y-1 text-sm font-medium">Tolerance (%)
            <input type="number" min="0" max="100" step="0.01" value={percentage} onChange={(event) => setPercentage(event.target.value)} required className="h-10 w-full rounded-md border bg-background px-3 font-normal" />
          </label>
          <label className="space-y-1 text-sm font-medium">Effective date and time
            <input type="datetime-local" value={effectiveAt} onChange={(event) => setEffectiveAt(event.target.value)} required className="h-10 w-full rounded-md border bg-background px-3 font-normal" />
          </label>
          <label className="space-y-1 text-sm font-medium md:col-span-2">Technical justification
            <textarea value={justification} onChange={(event) => setJustification(event.target.value)} required minLength={10} maxLength={2000} rows={3} className="w-full rounded-md border bg-background px-3 py-2 font-normal" />
          </label>
          <label className="space-y-1 text-sm font-medium md:col-span-2">Evidence reference
            <input value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} required minLength={2} maxLength={500} className="h-10 w-full rounded-md border bg-background px-3 font-normal" />
          </label>
        </div>
        <button type="submit" disabled={pending || !recipeVersionId || !percentage || !effectiveAt || !justification.trim() || !evidenceReference.trim() || (toleranceType === 'material_consumption' && !materialId)} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{pending ? 'Saving…' : 'Save draft version'}</button>
        {data.recipes.length === 0 && <p className="text-sm text-muted-foreground">No recipe versions are available for governance yet.</p>}
      </form>
    </section>

    <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold">Tolerance version history</h2>
      <p className="mt-1 text-sm text-muted-foreground">Approved values are immutable. Corrections require a new version; production records retain the version used at assessment.</p>
      {data.standards.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No official standards have been recorded.</p> : <div className="mt-4 space-y-3">
        {data.standards.map((standard) => <article key={standard.id} className="rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-medium">{standard.productName} · {standard.recipeCode} v{standard.recipeVersion}{standard.materialCode ? ` · ${standard.materialCode} (${standard.materialUnit})` : ''}</h3>
              <p className="text-sm text-muted-foreground">{standard.toleranceType === 'yield' ? 'Yield' : 'Material consumption'} · v{standard.version} · {(standard.toleranceBasisPoints / 100).toFixed(2)}% deviation · effective {new Date(standard.effectiveAt).toLocaleString()}</p>
            </div>
            <span className="rounded-full border px-2.5 py-1 text-xs capitalize">{standard.status}</span>
          </div>
          <p className="mt-2 text-sm">{standard.justification}</p>
          <p className="text-xs text-muted-foreground">Evidence: {standard.evidenceReference} · Created by {standard.createdByUserId}</p>
          <label className="mt-3 block space-y-1 text-xs font-medium">Decision note
            <input value={decisionNotes[standard.id] ?? ''} onChange={(event) => setDecisionNotes((current) => ({ ...current, [standard.id]: event.target.value }))} minLength={5} maxLength={1000} className="h-9 w-full rounded-md border bg-background px-3 text-sm font-normal" placeholder="Record why this status change is appropriate" />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            {standard.status === 'draft' && <button type="button" disabled={pending} onClick={() => transition(standard, 'approve')} className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50">Approve version</button>}
            {standard.status === 'approved' && <button type="button" disabled={pending} onClick={() => transition(standard, 'activate')} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">Activate standard</button>}
            {standard.status === 'active' && <button type="button" disabled={pending} onClick={() => transition(standard, 'deactivate')} className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50">Deactivate standard</button>}
          </div>
        </article>)}
      </div>}
    </section>
  </div>;
}
