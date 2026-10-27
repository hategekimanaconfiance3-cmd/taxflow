"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ConfidentialMaterial { materialCode: string; confidentialName: string; unit: string; plannedQuantity: number; actualQuantity: number; }

export function ConfidentialFormulaAccess({ batchId }: { batchId: string }) {
  const [reason, setReason] = useState("");
  const [materials, setMaterials] = useState<ConfidentialMaterial[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function requestAccess() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/production/${encodeURIComponent(batchId)}/confidential-materials`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }),
      });
      const result = await response.json() as { materials?: { materials: ConfidentialMaterial[] }; error?: string };
      if (!response.ok || !result.materials) {
        setError(result.error ?? "Confidential material details could not be loaded.");
        return;
      }
      setMaterials(result.materials.materials);
    } catch {
      setError("Confidential material details could not be loaded. Check your connection and retry.");
    } finally {
      setPending(false);
    }
  }

  return <section className="space-y-3 rounded-md border border-amber-300 p-4">
    <div><h2 className="font-semibold">Confidential formula details</h2><p className="text-sm text-muted-foreground">Access requires a specific investigation reason and is recorded in the audit trail.</p></div>
    {!materials && <>
      <Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder="Document why full material names are necessary for this review (at least 10 characters)." />
      <Button type="button" onClick={requestAccess} disabled={pending || reason.trim().length < 10}>{pending ? "Recording access…" : "Request audited access"}</Button>
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {materials && <ul className="space-y-1 text-sm">{materials.map((material) => <li key={material.materialCode}><span className="font-mono">{material.materialCode}</span> · {material.confidentialName} · planned {material.plannedQuantity} {material.unit}, actual {material.actualQuantity} {material.unit}</li>)}</ul>}
  </section>;
}
