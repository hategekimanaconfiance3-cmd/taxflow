"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface HistoryAnalysis {
  ruleVersion: string;
  interpretation: string;
  batches: Array<{
    batchReference: string;
    recipe: { code: string; version: number; outputQuantity: number };
    signalCount: number;
    metrics: Array<{
      code: string;
      label: string;
      unit: string;
      expectedRatio: number | null;
      observedRatio: number | null;
      deviationPercent: number | null;
      thresholdPercent: number;
      baselineBatchCount: number;
      confidence: string;
      signal: string;
      evidenceBatchReferences: string[];
    }>;
  }>;
}

export function ProductionHistoryFindingEvidence({ batchId }: { batchId: string }) {
  const [analysis, setAnalysis] = useState<HistoryAnalysis | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function loadEvidence() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/production/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ batchId }),
      });
      const result = await response.json() as { analysis?: HistoryAnalysis; error?: string };
      if (!response.ok || !result.analysis) {
        setError(result.error ?? "Historical evidence could not be loaded.");
        return;
      }
      setAnalysis(result.analysis);
    } catch {
      setError("Historical evidence could not be loaded. Retry or contact support.");
    } finally {
      setPending(false);
    }
  }

  return <section className="space-y-3 rounded-lg border p-4">
    <div><h2 className="font-semibold">Restricted historical production evidence</h2><p className="text-sm text-muted-foreground">The server rechecks `production.formula.read` before returning recipe details.</p></div>
    <Button type="button" variant="outline" onClick={() => void loadEvidence()} disabled={pending}>{pending && <Loader2 className="mr-2 size-4 animate-spin" />}Load historical comparison</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {analysis && <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Rule {analysis.ruleVersion}. {analysis.interpretation}</p>
      {analysis.batches.map((batch) => <article key={batch.batchReference} className="space-y-2 rounded-md bg-muted/30 p-3">
        <h3 className="text-sm font-medium">{batch.batchReference} · Recipe {batch.recipe.code} v{batch.recipe.version} · {batch.signalCount} review signal(s)</h3>
        {batch.metrics.map((metric) => <div key={metric.code} className="rounded border bg-background p-2 text-xs">
          <p className="font-medium">{metric.label} · {metric.signal.replaceAll("_", " ")} · {metric.confidence} confidence</p>
          <p>Expected ratio: {metric.expectedRatio === null ? "insufficient verified history" : `${(metric.expectedRatio * 100).toFixed(2)}%`} · Observed ratio: {metric.observedRatio === null ? "not recorded" : `${(metric.observedRatio * 100).toFixed(2)}%`} · Deviation: {metric.deviationPercent === null ? "unavailable" : `${metric.deviationPercent.toFixed(2)}%`} · Threshold: {metric.thresholdPercent.toFixed(2)}% · Verified samples: {metric.baselineBatchCount}</p>
          {metric.evidenceBatchReferences.length > 0 && <p className="text-muted-foreground">Baseline batches: {metric.evidenceBatchReferences.join(", ")}</p>}
        </div>)}
      </article>)}
    </div>}
  </section>;
}
