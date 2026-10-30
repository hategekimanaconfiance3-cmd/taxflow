"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Loader2, PackageCheck } from "lucide-react";

interface Receipt {
  id: string;
  manufacturerId: string;
  manufacturerName: string | null;
  materialCode: string;
  origin: string;
  importDeclarationId: string | null;
  transactionId: string | null;
  supplierReference: string | null;
  evidenceReference: string;
  quantity: string;
  unit: string;
  submittedAt: Date | string;
}

interface Batch {
  id: string;
  manufacturerId: string;
  manufacturerName: string | null;
  productId: string;
  productName: string;
  batchReference: string;
  outputQuantity: number;
  outputUnit: string;
  validationStatus: string;
  createdAt: Date | string;
  materials: Array<{ materialId: string; materialCode: string; unit: string; requiredQuantity: string; availableQuantity: string; shortage: string }>;
  historyComparison: {
    comparisonAt: string;
    ruleVersion: string;
    alertReasons: string[];
    limitations: string[];
    previousDeclarations: Array<{ batchReference: string; plannedOutputQuantity: number | null; declaredOutputQuantity: number; periodEnd: string; materials: Array<{ materialCode: string; unit: string; plannedQuantity: number; actualQuantity: number }> }>;
    materials: Array<{ materialCode: string; unit: string; plannedQuantity: number; actualQuantity: number; consumptionToleranceBasisPoints: number | null; verifiedAvailableQuantity: string; shortageQuantity: string }>;
    metrics: Array<{ code: string; signal: string; expectedRatio: number | null; observedRatio: number | null; deviationPercent: number | null; thresholdPercent: number; baselineBatchCount: number; confidence: string }>;
  } | null;
}

function ReviewDecision({ endpoint, recordId, actionLabel }: { endpoint: string; recordId: string; actionLabel: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState("");

  function submit(decision: "verify" | "reject" | "release", event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (note.trim().length < 5) {
      setFeedback("Enter a review note with at least 5 characters.");
      return;
    }
    startTransition(async () => {
      try {
        const idField = endpoint.includes("batches") ? "batchId" : "receiptId";
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ [idField]: recordId, decision, note: note.trim() }),
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) {
          setFeedback(result.error ?? "Review was not saved. Refresh and review the latest evidence.");
          return;
        }
        setFeedback(decision === "release" ? "Batch released; material and finished-stock movements posted atomically." : decision === "verify" ? "Receipt verified and included in the material ledger." : "Decision recorded. The batch or receipt remains unavailable for posting.");
        router.refresh();
      } catch {
        setFeedback("Could not save the review. Check your connection and retry.");
      }
    });
  }

  return (
    <form onSubmit={(event) => submit(actionLabel === "Release batch" ? "release" : "verify", event)} className="space-y-2">
      <Textarea aria-label="Review note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Document evidence reviewed and rationale" maxLength={1000} />
      {feedback && <p role="status" className="text-xs text-muted-foreground">{feedback}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending && <Loader2 className="animate-spin" data-icon="inline-start" />}{actionLabel}</Button>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={(event) => {
          const form = event.currentTarget.form;
          if (!form) return;
          submit("reject", { preventDefault: () => undefined } as React.FormEvent<HTMLFormElement>);
        }}>Reject/hold</Button>
      </div>
    </form>
  );
}

export function ProductionMaterialReviewQueue({ receipts, batches, canReviewBatches, focusBatchId }: { receipts: Receipt[]; batches: Batch[]; canReviewBatches: boolean; focusBatchId?: string | null }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><PackageCheck className="h-4 w-4" /> Material receipts awaiting verification</CardTitle></CardHeader>
        <CardContent>
          {receipts.length === 0 ? <p className="text-sm text-muted-foreground">No pending material receipts.</p> : <div className="divide-y">
            {receipts.map((receipt) => <article key={receipt.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-medium">{receipt.manufacturerName ?? "Manufacturer"} · <span className="font-mono">{receipt.materialCode}</span></p><p className="text-sm text-muted-foreground">{receipt.origin.replaceAll("_", " ")} · {receipt.quantity} {receipt.unit} · {new Date(receipt.submittedAt).toLocaleString()}</p></div>
                <Badge variant="secondary">Pending verification</Badge>
              </div>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Evidence reference</dt><dd className="break-all">{receipt.evidenceReference}</dd></div>
                <div><dt className="text-muted-foreground">Source record</dt><dd className="break-all">{receipt.importDeclarationId ? `Import ${receipt.importDeclarationId}` : receipt.transactionId ? `Transaction ${receipt.transactionId}` : receipt.supplierReference ?? "Opening balance"}</dd></div>
              </dl>
              <ReviewDecision endpoint="/api/admin/production/material-accounting/receipts" recordId={receipt.id} actionLabel="Verify receipt" />
            </article>)}
          </div>}
        </CardContent>
      </Card>

      {canReviewBatches && <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-4 w-4" /> Production batches held for material review</CardTitle><p className="text-sm text-muted-foreground">Release requires sufficient verified stock for every actual material quantity. Release posts material consumption and finished stock in one database transaction.</p></CardHeader>
        <CardContent>
          {batches.length === 0 ? <p className="text-sm text-muted-foreground">No production batches awaiting review.</p> : <div className="divide-y">
            {batches.map((batch) => {
              const shortages = batch.materials.filter((material) => Number(material.shortage) > 0);
              return <article id={`production-batch-${batch.id}`} key={batch.id} className={`space-y-3 py-4 first:pt-0 last:pb-0 ${focusBatchId === batch.id ? 'rounded-md bg-primary/5 px-3 ring-2 ring-primary' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="font-medium">{batch.manufacturerName ?? "Manufacturer"} · {batch.productName}</p><p className="text-sm text-muted-foreground">{batch.batchReference} · output {batch.outputQuantity.toLocaleString()} {batch.outputUnit} · {new Date(batch.createdAt).toLocaleString()}</p></div>
                  <Badge variant={shortages.length ? "destructive" : "secondary"}>{shortages.length ? `${shortages.length} material shortage${shortages.length === 1 ? "" : "s"}` : batch.validationStatus.replaceAll("_", " ")}</Badge>
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[560px] text-sm"><thead><tr className="border-b bg-muted/40 text-left"><th className="p-2">Protected material code</th><th className="p-2">Actual used</th><th className="p-2">Verified available</th><th className="p-2">Shortage</th></tr></thead><tbody>
                    {batch.materials.map((material) => <tr key={material.materialId} className="border-b last:border-0"><td className="p-2 font-mono">{material.materialCode}</td><td className="p-2">{material.requiredQuantity} {material.unit}</td><td className="p-2">{material.availableQuantity} {material.unit}</td><td className={Number(material.shortage) > 0 ? "p-2 font-medium text-destructive" : "p-2"}>{material.shortage} {material.unit}</td></tr>)}
                  </tbody></table>
                </div>
                {shortages.length > 0 && <p role="alert" className="text-sm text-destructive">Insufficient verified material. Do not release until verified receipts or an authorized evidence-backed adjustment resolves the shortage.</p>}
                {batch.historyComparison && <details open={focusBatchId === batch.id} className="rounded-md border bg-muted/20 p-3">
                  <summary className="cursor-pointer text-sm font-medium">Historical comparison · {batch.historyComparison.alertReasons.length ? 'review signal' : 'recorded'}</summary>
                  <div className="mt-3 space-y-3 text-sm">
                    <p className="text-muted-foreground">Compared {new Date(batch.historyComparison.comparisonAt).toLocaleString()} · rule {batch.historyComparison.ruleVersion}. Signals request human review and are not findings of wrongdoing.</p>
                    {batch.historyComparison.alertReasons.length > 0 && <p className="font-medium text-amber-700">{batch.historyComparison.alertReasons.join(' · ').replaceAll('_', ' ')}</p>}
                    {batch.historyComparison.previousDeclarations.length > 0 && <div>
                      <p className="font-medium">Previous declarations for this product</p>
                      <ul className="mt-1 space-y-2 text-muted-foreground">{batch.historyComparison.previousDeclarations.slice(0, 5).map((previous) => <li key={previous.batchReference}>
                        <p>{previous.batchReference} · {previous.declaredOutputQuantity} {batch.outputUnit} output{previous.plannedOutputQuantity === null ? '' : ` from ${previous.plannedOutputQuantity} planned`} · {new Date(previous.periodEnd).toLocaleDateString()}</p>
                        {previous.materials.length > 0 && <p className="ml-3 font-mono text-xs">{previous.materials.map((material) => `${material.materialCode}: ${material.actualQuantity} ${material.unit} (${(material.actualQuantity / previous.declaredOutputQuantity).toFixed(6)} ${material.unit}/${batch.outputUnit})`).join(' · ')}</p>}
                      </li>)}</ul>
                    </div>}
                    {batch.historyComparison.materials.length > 0 && <div className="overflow-x-auto rounded border">
                      <table className="w-full min-w-[560px] text-xs"><thead><tr className="border-b bg-muted/40 text-left"><th className="p-2">Protected code</th><th className="p-2">BOM planned</th><th className="p-2">Declared actual</th><th className="p-2">Material tolerance</th><th className="p-2">Verified stock</th><th className="p-2">Shortage</th></tr></thead><tbody>
                        {batch.historyComparison.materials.map((material) => <tr key={material.materialCode} className="border-b last:border-0"><td className="p-2 font-mono">{material.materialCode}</td><td className="p-2">{material.plannedQuantity} {material.unit}</td><td className="p-2">{material.actualQuantity} {material.unit}</td><td className="p-2">{material.consumptionToleranceBasisPoints === null ? 'Not configured' : `${(material.consumptionToleranceBasisPoints / 100).toFixed(2)}%`}</td><td className="p-2">{material.verifiedAvailableQuantity} {material.unit}</td><td className="p-2">{material.shortageQuantity} {material.unit}</td></tr>)}
                      </tbody></table>
                    </div>}
                    {batch.historyComparison.metrics.length > 0 && <div className="overflow-x-auto rounded border">
                      <table className="w-full min-w-[560px] text-xs"><thead><tr className="border-b bg-muted/40 text-left"><th className="p-2">Metric / protected code</th><th className="p-2">Observed ratio</th><th className="p-2">Historical median</th><th className="p-2">Change</th><th className="p-2">Baseline</th><th className="p-2">Signal</th></tr></thead><tbody>
                        {batch.historyComparison.metrics.map((metric) => <tr key={metric.code} className="border-b last:border-0"><td className="p-2 font-mono">{metric.code}</td><td className="p-2">{metric.observedRatio?.toFixed(4) ?? '—'}</td><td className="p-2">{metric.expectedRatio?.toFixed(4) ?? '—'}</td><td className="p-2">{metric.deviationPercent === null ? '—' : `${metric.deviationPercent.toFixed(2)}%`} {metric.thresholdPercent > 0 ? `(range ${metric.thresholdPercent.toFixed(2)}%)` : ''}</td><td className="p-2">{metric.baselineBatchCount} · {metric.confidence}</td><td className="p-2">{metric.signal.replaceAll('_', ' ')}</td></tr>)}
                      </tbody></table>
                    </div>}
                    {batch.historyComparison.limitations.map((limitation) => <p key={limitation} className="text-muted-foreground">{limitation}</p>)}
                  </div>
                </details>}
                <ReviewDecision endpoint="/api/admin/production/material-accounting/batches" recordId={batch.id} actionLabel="Release batch" />
              </article>;
            })}
          </div>}
        </CardContent>
      </Card>}
    </div>
  );
}
