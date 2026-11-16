'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface FactorySummary {
  id: string;
  factoryCode: string;
  name: string;
  address: string;
  industryType: string;
  onboardingStatus: string;
  integrationStatus: string;
  connectivityStatus: string;
  verificationStatus: string;
  lineCount: number;
}

interface FactoryManagementProps {
  initialFactories: FactorySummary[];
}

interface LineDraft {
  lineCode: string;
  lineName: string;
  productTypes: string;
}

const defaultStages = [
  ['RAW_MATERIAL_PREPARATION', 'Raw material preparation'],
  ['WATER_TREATMENT', 'Water treatment'],
  ['MIXING_FORMULATION', 'Mixing and formulation'],
  ['FILLING', 'Filling'],
  ['CAPPING_SEALING', 'Capping and sealing'],
  ['LABELING', 'Labeling'],
  ['PACKAGING', 'Packaging'],
  ['QUALITY_INSPECTION', 'Quality inspection'],
  ['FINISHED_GOODS_STORAGE', 'Finished-goods storage'],
  ['DISPATCH', 'Dispatch'],
] as const;

export function FactoryManagement({ initialFactories }: FactoryManagementProps) {
  const router = useRouter();
  const [factories, setFactories] = useState(initialFactories);
  const [factoryCode, setFactoryCode] = useState('');
  const [factoryName, setFactoryName] = useState('');
  const [address, setAddress] = useState('');
  const [lineDrafts, setLineDrafts] = useState<Record<string, LineDraft>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function lineDraft(factoryId: string): LineDraft {
    return lineDrafts[factoryId] ?? { lineCode: '', lineName: '', productTypes: 'beverage' };
  }

  function updateLineDraft(factoryId: string, patch: Partial<LineDraft>) {
    setLineDrafts((current) => ({
      ...current,
      [factoryId]: { ...lineDraft(factoryId), ...patch },
    }));
  }

  async function createFactory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/factories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factoryCode, name: factoryName, address, industryType: 'beverage' }),
      });
      const result: { factory?: FactorySummary; error?: string } = await response.json();
      if (!response.ok || !result.factory) throw new Error(result.error ?? 'Factory registration failed.');
      setFactories((current) => [result.factory!, ...current]);
      setFactoryCode('');
      setFactoryName('');
      setAddress('');
      setMessage('Factory registered as a draft. Add production lines, then submit it for review.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Factory registration failed.');
    } finally {
      setBusy(false);
    }
  }

  async function submitFactory(factoryId: string) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/factories/${factoryId}/submit`, { method: 'POST' });
      const result: { factory?: FactorySummary; error?: string } = await response.json();
      if (!response.ok || !result.factory) throw new Error(result.error ?? 'Factory submission failed.');
      setFactories((current) => current.map((item) => item.id === factoryId ? { ...item, ...result.factory } : item));
      setMessage('Factory submitted for authorized officer review.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Factory submission failed.');
    } finally {
      setBusy(false);
    }
  }

  async function registerLine(factoryId: string, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draft = lineDraft(factoryId);
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/factories/${factoryId}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factoryId,
          lineCode: draft.lineCode,
          name: draft.lineName,
          productionCategory: 'beverage',
          productTypes: draft.productTypes.split(',').map((value) => value.trim()).filter(Boolean),
          stages: defaultStages.map(([stageCode, name], index) => ({ stageCode, name, sequenceNumber: index + 1 })),
        }),
      });
      const result: { line?: { id: string }; error?: string } = await response.json();
      if (!response.ok || !result.line) throw new Error(result.error ?? 'Production-line registration failed.');
      setFactories((current) => current.map((item) => item.id === factoryId ? { ...item, lineCount: item.lineCount + 1 } : item));
      setLineDrafts((current) => ({ ...current, [factoryId]: { lineCode: '', lineName: '', productTypes: 'beverage' } }));
      setMessage('Production line registered with the standard beverage process stages.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Production-line registration failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Factories</h1>
        <p className="mt-1 text-sm text-muted-foreground">Register factory locations and production lines before industrial integration is configured.</p>
      </div>

      {message && <div role="status" className="rounded-md border bg-muted/30 px-4 py-3 text-sm">{message}</div>}

      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold">Register a factory</h2>
        <p className="mt-1 text-sm text-muted-foreground">Registration creates a draft record only. It does not approve integration or change inventory.</p>
        <form onSubmit={createFactory} className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="grid gap-1 text-sm">Factory code<input required maxLength={64} value={factoryCode} onChange={(event) => setFactoryCode(event.target.value)} className="h-10 rounded-md border bg-background px-3" placeholder="KGL-01" /></label>
          <label className="grid gap-1 text-sm">Factory name<input required maxLength={160} value={factoryName} onChange={(event) => setFactoryName(event.target.value)} className="h-10 rounded-md border bg-background px-3" placeholder="Kigali Beverage Plant" /></label>
          <label className="grid gap-1 text-sm">Address<input required maxLength={500} value={address} onChange={(event) => setAddress(event.target.value)} className="h-10 rounded-md border bg-background px-3" placeholder="Kigali, Rwanda" /></label>
          <button disabled={busy} type="submit" className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50 md:col-span-3 md:w-fit">{busy ? 'Saving…' : 'Register factory'}</button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">My factories</h2>
        {factories.length === 0 ? <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">No factories registered yet.</div> : factories.map((item) => (
          <article key={item.id} className="rounded-lg border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><h3 className="font-semibold">{item.name}</h3><p className="text-sm text-muted-foreground">{item.factoryCode} · {item.address}</p></div>
              <span className="rounded-full border px-3 py-1 text-xs capitalize">{item.onboardingStatus.replaceAll('_', ' ')}</span>
            </div>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><span className="text-muted-foreground">Verification</span><p className="capitalize">{item.verificationStatus}</p></div><div><span className="text-muted-foreground">Integration</span><p className="capitalize">{item.integrationStatus.replaceAll('_', ' ')}</p></div><div><span className="text-muted-foreground">Production lines</span><p>{item.lineCount}</p></div></div>
            {item.onboardingStatus === 'draft' && <button disabled={busy} onClick={() => submitFactory(item.id)} className="mt-4 rounded-md border px-3 py-2 text-sm disabled:opacity-50">Submit for review</button>}
            <form onSubmit={(event) => registerLine(item.id, event)} className="mt-5 rounded-md border bg-muted/10 p-4">
              <h4 className="text-sm font-semibold">Register a production line</h4>
              <p className="mt-1 text-xs text-muted-foreground">Lines are registered as plant structure only. Machine integration is a later approval step.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="grid gap-1 text-xs">Line code<input required maxLength={64} value={lineDraft(item.id).lineCode} onChange={(event) => updateLineDraft(item.id, { lineCode: event.target.value })} className="h-9 rounded-md border bg-background px-3 text-sm" placeholder="FILL-01" /></label>
                <label className="grid gap-1 text-xs">Line name<input required maxLength={160} value={lineDraft(item.id).lineName} onChange={(event) => updateLineDraft(item.id, { lineName: event.target.value })} className="h-9 rounded-md border bg-background px-3 text-sm" placeholder="PET bottling line" /></label>
                <label className="grid gap-1 text-xs">Product types<input required value={lineDraft(item.id).productTypes} onChange={(event) => updateLineDraft(item.id, { productTypes: event.target.value })} className="h-9 rounded-md border bg-background px-3 text-sm" placeholder="beverage, soda" /></label>
              </div>
              <button disabled={busy} type="submit" className="mt-3 rounded-md border px-3 py-2 text-sm disabled:opacity-50">Register line</button>
            </form>
            <details className="mt-4 rounded-md bg-muted/20 p-3"><summary className="cursor-pointer text-sm font-medium">Planned beverage stages</summary><ol className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">{defaultStages.map(([code, label], index) => <li key={code}>{index + 1}. {label}</li>)}</ol></details>
          </article>
        ))}
      </section>
    </div>
  );
}
