'use client';

import { useState } from 'react';

interface FactoryForReview {
  id: string;
  factoryCode: string;
  name: string;
  address: string;
  industryType: string;
  onboardingStatus: string;
  integrationStatus: string;
  verificationStatus: string;
  lineCount: number;
  reviewNote: string | null;
}

interface FactoryReviewWorkspaceProps {
  initialFactories: FactoryForReview[];
  canReview: boolean;
}

const nextDecisions: Record<string, string[]> = {
  submitted: ['under_review', 'rejected'],
  under_review: ['technical_assessment', 'rejected'],
  technical_assessment: ['integration_pending', 'rejected'],
  integration_pending: ['integration_testing', 'rejected'],
  integration_testing: ['approved', 'rejected'],
  approved: ['active', 'suspended'],
  active: ['suspended'],
  suspended: ['active', 'rejected'],
};

export function FactoryReviewWorkspace({ initialFactories, canReview }: FactoryReviewWorkspaceProps) {
  const [factories, setFactories] = useState(initialFactories);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function review(factoryId: string, decision: string) {
    setBusyId(factoryId);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/factories/${factoryId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factoryId, decision, note: notes[factoryId] ?? '' }),
      });
      const result: { factory?: FactoryForReview; error?: string } = await response.json();
      if (!response.ok || !result.factory) throw new Error(result.error ?? 'Factory review could not be saved.');
      setFactories((current) => current.map((item) => item.id === factoryId ? { ...item, ...result.factory } : item));
      setMessage(`Factory ${decision.replaceAll('_', ' ')}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Factory review could not be saved.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Factory onboarding</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review factory registration before any future industrial integration is enabled.</p>
      </div>
      {message && <div role="status" className="rounded-md border bg-muted/30 px-4 py-3 text-sm">{message}</div>}
      {factories.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">No factory registrations are awaiting review.</div>
      ) : (
        <div className="space-y-4">
          {factories.map((factory) => {
            const decisions = nextDecisions[factory.onboardingStatus] ?? [];
            return (
              <article key={factory.id} className="rounded-lg border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold">{factory.name}</h2>
                    <p className="text-sm text-muted-foreground">{factory.factoryCode} · {factory.address}</p>
                  </div>
                  <span className="rounded-full border px-3 py-1 text-xs capitalize">{factory.onboardingStatus.replaceAll('_', ' ')}</span>
                </div>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
                  <div><span className="text-muted-foreground">Industry</span><p className="capitalize">{factory.industryType}</p></div>
                  <div><span className="text-muted-foreground">Verification</span><p className="capitalize">{factory.verificationStatus}</p></div>
                  <div><span className="text-muted-foreground">Integration</span><p className="capitalize">{factory.integrationStatus.replaceAll('_', ' ')}</p></div>
                  <div><span className="text-muted-foreground">Production lines</span><p>{factory.lineCount}</p></div>
                </div>
                {canReview && decisions.length > 0 && (
                  <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
                    <label className="grid gap-1 text-sm">Review note<input required maxLength={2000} value={notes[factory.id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [factory.id]: event.target.value }))} className="h-10 rounded-md border bg-background px-3" placeholder="Record the evidence or reason for this decision" /></label>
                    <div className="flex flex-wrap items-end gap-2">
                      {decisions.map((decision) => <button key={decision} disabled={busyId === factory.id || !(notes[factory.id] ?? '').trim()} onClick={() => review(factory.id, decision)} className="rounded-md border px-3 py-2 text-sm capitalize disabled:opacity-50">{decision.replaceAll('_', ' ')}</button>)}
                    </div>
                  </div>
                )}
                {factory.reviewNote && <p className="mt-4 text-sm text-muted-foreground">Latest note: {factory.reviewNote}</p>}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
