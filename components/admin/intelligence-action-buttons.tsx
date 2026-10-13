'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ScanSearch, Database, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { runReconciliationScan } from '@/lib/actions/ai-finding.action';
import { getDataQualityMetrics } from '@/lib/actions/admin-data-quality.action';

// ---------------------------------------------------------------------------
// Reusable action card with loading/success/error state
// ---------------------------------------------------------------------------

type ScanState = 'idle' | 'loading' | 'success' | 'error';

interface ActionCardProps {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  onAction: () => Promise<void>;
}

function ActionCard({ icon, iconBg, title, description, onAction }: ActionCardProps) {
  const [state, setState] = useState<ScanState>('idle');
  const [msg, setMsg] = useState('');

  async function handleClick() {
    if (state === 'loading') return;
    setState('loading');
    setMsg('');
    try {
      await onAction();
      setState('success');
      setMsg('Done!');
    } catch (err) {
      setState('error');
      setMsg(String(err));
    } finally {
      setTimeout(() => setState('idle'), 3500);
    }
  }

  return (
    <Card
      onClick={handleClick}
      className={`h-full transition-colors cursor-pointer select-none ${
        state === 'loading' ? 'opacity-60 pointer-events-none' :
        state === 'success' ? 'border-emerald-300' :
        state === 'error'   ? 'border-red-300' :
        'hover:border-foreground/30'
      }`}
    >
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
          {state === 'loading' ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : state === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : state === 'error' ? (
            <XCircle className="h-4 w-4 text-red-500" />
          ) : (
            icon
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
            {state === 'loading' ? 'Running…' :
             state === 'success' ? (msg || 'Completed successfully.') :
             state === 'error'   ? (msg || 'An error occurred.') :
             description}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// IntelligenceActionButtons — rendered inside the Intelligence Hub page.
// These cards call server actions (imported from their respective modules).
// ---------------------------------------------------------------------------

export function IntelligenceActionButtons() {
  return (
    <>
      <ActionCard
        icon={<ScanSearch className="h-4 w-4 text-violet-600" />}
        iconBg="bg-violet-500/10"
        title="Run Reconciliation Scan"
        description="Compute AI risk scores for all registered traders."
        onAction={async () => {
          const result = await runReconciliationScan();
          if (!result.success) throw new Error(result.error ?? 'Scan failed');
        }}
      />
      <ActionCard
        icon={<Database className="h-4 w-4 text-emerald-600" />}
        iconBg="bg-emerald-500/10"
        title="Run Data Quality Check"
        description="Assess trader record completeness and stock integrity."
        onAction={async () => {
          // getDataQualityMetrics is a server action — calling it validates & returns data
          await getDataQualityMetrics();
        }}
      />
    </>
  );
}
