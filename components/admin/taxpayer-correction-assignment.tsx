"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignTaxpayerCorrectionRequest } from "@/lib/actions/taxpayer-correction.action";

type QueueRow = { id: string; reference: string; taxpayerName: string; tin: string | null; fieldKey: string; status: string; createdAt: Date };
type Officer = { id: string; name: string; staffId: string };

export function TaxpayerCorrectionAssignment({ requests, officers }: { requests: QueueRow[]; officers: Officer[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const assign = (requestId: string) => startTransition(async () => {
    setError("");
    try {
      await assignTaxpayerCorrectionRequest({ requestId, staffRecordId: selected[requestId], reason });
      setReason(""); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not assign this request."); }
  });
  return <section className="rounded-lg border bg-card p-5">
    <h2 className="text-lg font-semibold">Unassigned requests</h2>
    <p className="mb-4 mt-1 text-sm text-muted-foreground">Assignment uses a dedicated permission and does not grant final-decision authority.</p>
    {error ? <p role="alert" className="mb-3 text-sm text-destructive">{error}</p> : null}
    {!requests.length ? <p className="text-sm text-muted-foreground">No unassigned requests.</p> : <div className="space-y-4">{requests.map((item) => <article key={item.id} className="rounded-md border p-4">
      <p className="font-medium">{item.reference} · {item.taxpayerName} · {item.tin ?? "TIN unavailable"}</p><p className="text-sm text-muted-foreground">{item.fieldKey} · {item.status} · {item.createdAt.toLocaleDateString()}</p>
      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1.5fr_auto]">
        <select aria-label={`Assign ${item.reference} to officer`} className="rounded-md border bg-background px-3 py-2 text-sm" value={selected[item.id] ?? ""} onChange={(event) => setSelected((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Select Correction Officer</option>{officers.map((officer) => <option key={officer.id} value={officer.id}>{officer.name} · {officer.staffId}</option>)}</select>
        <input aria-label={`Assignment reason for ${item.reference}`} className="rounded-md border bg-background px-3 py-2 text-sm" minLength={10} placeholder="Assignment reason (required)" value={reason} onChange={(event) => setReason(event.target.value)} />
        <button disabled={isPending || !selected[item.id] || reason.trim().length < 10} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50" onClick={() => assign(item.id)}>{isPending ? "Assigning…" : "Assign"}</button>
      </div>
    </article>)}</div>}
  </section>;
}
