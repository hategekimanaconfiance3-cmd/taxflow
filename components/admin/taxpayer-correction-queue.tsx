"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type CorrectionCase = {
  id: string; reference: string; taxpayerId: string; taxpayerName: string; tin: string | null;
  businessName: string | null; fieldKey: string; originalValue: string; requestedValue: string;
  reason: string; status: string; recommendation: string | null; recommendationReason: string | null;
  createdAt: Date; updatedAt: Date;
};
type Counts = { assigned: number; new: number; awaitingEvidence: number; recommended: number; overdue: number };

export function TaxpayerCorrectionQueue({ cases, counts }: { cases: CorrectionCase[]; counts: Counts }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = useMemo(() => cases.filter((item) => {
    const matchesQuery = `${item.reference} ${item.tin ?? ""} ${item.taxpayerName} ${item.businessName ?? ""} ${item.fieldKey}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (status === "all" || item.status === status);
  }), [cases, query, status]);
  const metrics = [
    ["Assigned cases", counts.assigned], ["Under review", counts.new],
    ["Awaiting evidence", counts.awaitingEvidence], ["Recommendations", counts.recommended], ["Overdue", counts.overdue],
  ] as const;
  return <section className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{metrics.map(([label, value]) => <div className="rounded-lg border bg-card p-4" key={label}><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</div>
    <div className="rounded-lg border bg-card p-5">
      <h2 className="text-lg font-semibold">My correction requests</h2>
      <div className="my-4 flex flex-wrap gap-3">
        <label className="sr-only" htmlFor="correction-query">Search assigned cases</label>
        <input id="correction-query" className="min-w-64 flex-1 rounded-md border bg-background px-3 py-2 text-sm" placeholder="Search reference, taxpayer, TIN, field…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <label className="sr-only" htmlFor="correction-status">Filter status</label>
        <select id="correction-status" className="rounded-md border bg-background px-3 py-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All statuses</option><option value="under_review">Under review</option><option value="awaiting_evidence">Awaiting evidence</option><option value="recommended_approval">Recommended approval</option><option value="recommended_rejection">Recommended rejection</option>
        </select>
      </div>
      {!filtered.length ? <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">{cases.length ? "No requests match these filters." : "No requests are assigned to you."}</div> : <div className="space-y-3">{filtered.map((item) => <article key={item.id} className="rounded-md border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><Link href={`/admin/corrections/${item.id}`} className="font-semibold underline">{item.reference}</Link><p className="mt-1 text-sm">{item.taxpayerName} · {item.tin ?? "TIN unavailable"} · {item.businessName ?? ""}</p><p className="text-sm text-muted-foreground">{item.fieldKey}: “{item.originalValue || "(empty)"}” → “{item.requestedValue}”</p></div><span className="rounded-full border px-2 py-1 text-xs">{item.status.replaceAll("_", " ")}</span></div>
        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{item.reason}</p><p className="mt-2 text-xs text-muted-foreground">Submitted {item.createdAt.toLocaleDateString()}</p>
      </article>)}</div>}
    </div>
  </section>;
}
