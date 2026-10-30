"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface TraceSource {
  movementId: string;
  quantityAllocated: string;
  origin: string;
  lotReference: string | null;
  receiptId: string | null;
  evidenceReference: string | null;
  supplierReference: string | null;
  verified: boolean;
  occurredAt: Date | string;
}

interface MaterialTrace {
  materialCode: string;
  unit: string;
  plannedQuantity: number;
  actualQuantity: number;
  wasteQuantity: string | null;
  remainingLinkedSourceQuantity: string;
  consumptionMovementId: string | null;
  consumptionToleranceStandardId: string | null;
  sources: TraceSource[];
}

interface TraceResponse {
  batch: {
    batchReference: string;
    productName: string;
    totalOutput: number;
    reportedGoodOutput: string | null;
    reportedRejectedOutput: string | null;
    goodOutput: string | null;
    rejectedOutput: string | null;
    status: string;
    yieldToleranceStandardId: string | null;
  };
  materials: MaterialTrace[];
}

export function ProductionMaterialTraceability({ batchId }: { batchId: string }) {
  const [trace, setTrace] = useState<TraceResponse | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (!trace) {
      setBusy(true);
      setError("");
      try {
        const response = await fetch(`/api/production/traceability?batchId=${encodeURIComponent(batchId)}`);
        const body = await response.json() as TraceResponse | { error?: string };
        if (!response.ok || !("materials" in body)) {
          setError("error" in body ? body.error ?? "Unable to load material traceability." : "Unable to load material traceability.");
          return;
        }
        setTrace(body);
      } catch {
        setError("Unable to load material traceability. Check your connection and retry.");
      } finally {
        setBusy(false);
      }
    }
    setExpanded(true);
  }

  return (
    <div className="mt-2">
      <Button type="button" size="sm" variant="outline" onClick={() => void toggle()} disabled={busy}>
        {busy ? "Loading trace…" : expanded ? "Hide material trace" : "View material trace"}
      </Button>
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      {expanded && trace && <div className="mt-3 space-y-3 rounded-md border bg-muted/20 p-3 text-xs">
        <p className="font-medium">{trace.batch.batchReference} · manufacturer reported {trace.batch.reportedGoodOutput ?? "—"} good / {trace.batch.reportedRejectedOutput ?? "—"} rejected · independently verified {trace.batch.goodOutput ?? "pending"} good / {trace.batch.rejectedOutput ?? "pending"} rejected · yield standard {trace.batch.yieldToleranceStandardId ?? "not configured"}</p>
        {trace.materials.map((material) => <section key={material.materialCode} className="space-y-1 border-t pt-2 first:border-0 first:pt-0">
          <p className="font-mono font-medium">{material.materialCode} · planned {material.plannedQuantity} {material.unit} · consumed {material.actualQuantity} {material.unit} · recorded waste {material.wasteQuantity ?? "—"} {material.unit}</p>
          <p className="text-muted-foreground">Remaining linked source quantity: {material.remainingLinkedSourceQuantity} {material.unit} · consumption standard {material.consumptionToleranceStandardId ?? "not configured"}</p>
          {material.sources.length === 0 ? <p className="text-amber-700">No source allocation is recorded for this batch.</p> : <ul className="space-y-1 pl-3">
            {material.sources.map((source) => <li key={source.movementId}>
              {source.quantityAllocated} {material.unit} from {source.origin.replaceAll("_", " ")}{source.lotReference ? ` · lot ${source.lotReference}` : " · no supported lot identifier"}{source.supplierReference ? ` · supplier ${source.supplierReference}` : ""} · {source.verified ? "verified" : "not verified"} · evidence {source.evidenceReference ?? "unavailable"} · {new Date(source.occurredAt).toLocaleDateString()}
            </li>)}
          </ul>}
        </section>)}
      </div>}
    </div>
  );
}
