"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCorrectionReviewComment, recommendTaxpayerCorrection, requestCorrectionEvidence } from "@/lib/actions/taxpayer-correction.action";

type Review = {
  request: { id: string; reference: string; category: string; fieldKey: string; originalValue: string; requestedValue: string; reason: string; status: string; recommendation: string | null; recommendationReason: string | null; createdAt: Date };
  taxpayerName: string; tin: string | null; businessName: string | null;
  events: Array<{ id: string; eventType: string; fromStatus: string | null; toStatus: string | null; reason: string | null; details: Record<string, unknown>; createdAt: Date }>;
  evidence: Array<{ id: string; filename: string; sizeBytes: number; createdAt: Date }>;
};

export function TaxpayerCorrectionReview({ correction }: { correction: Review }) {
  const { request, events, evidence } = correction;
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [comment, setComment] = useState("");
  const [evidenceReason, setEvidenceReason] = useState("");
  const [recommendation, setRecommendation] = useState<"RECOMMEND_APPROVAL" | "RECOMMEND_REJECTION">("RECOMMEND_APPROVAL");
  const [recommendationReason, setRecommendationReason] = useState("");
  const [error, setError] = useState("");
  const run = (operation: () => Promise<unknown>) => startTransition(async () => {
    setError("");
    try { await operation(); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The request could not be updated."); }
  });
  return <>
    <Link href="/admin/corrections" className="text-sm underline">← Correction requests</Link>
    <header><h1 className="text-2xl font-bold">{request.reference}</h1><p className="mt-1 text-sm text-muted-foreground">Assigned request review · {request.status.replaceAll("_", " ")}</p></header>
    {error ? <p role="alert" className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
    <section className="grid gap-4 rounded-lg border bg-card p-5 sm:grid-cols-2">
      <div><h2 className="font-semibold">Taxpayer</h2><p className="mt-2">{correction.taxpayerName}</p><p className="text-sm text-muted-foreground">TIN: {correction.tin ?? "Unavailable"}</p><p className="text-sm text-muted-foreground">Business: {correction.businessName ?? "Not recorded"}</p></div>
      <div><h2 className="font-semibold">Request details</h2><p className="mt-2 text-sm">Category: {request.category.replaceAll("_", " ")}</p><p className="text-sm">Submitted: {request.createdAt.toLocaleString()}</p><p className="text-sm">Field: {request.fieldKey}</p><p className="mt-2 text-sm text-muted-foreground">Reason: {request.reason}</p></div>
      <div className="rounded border p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Current recorded value</p><p className="mt-2 break-words">{request.originalValue || "(empty)"}</p></div>
      <div className="rounded border border-primary/30 bg-primary/5 p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Requested value · not applied</p><p className="mt-2 break-words">{request.requestedValue}</p></div>
    </section>
    <section className="rounded-lg border bg-card p-5"><h2 className="font-semibold">Supporting evidence</h2>{!evidence.length ? <p className="mt-2 text-sm text-muted-foreground">No evidence attached.</p> : <ul className="mt-3 space-y-2">{evidence.map((file) => <li key={file.id} className="flex items-center justify-between gap-3 text-sm"><span>{file.filename} · {(file.sizeBytes / 1024).toFixed(0)} KB</span><a className="underline" href={`/api/corrections/evidence/${file.id}`} target="_blank" rel="noreferrer">Open securely</a></li>)}</ul>}</section>
    {request.status === "under_review" || request.status === "awaiting_evidence" ? <section className="space-y-4 rounded-lg border bg-card p-5">
      <h2 className="font-semibold">Review actions</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-2"><label className="text-sm font-medium" htmlFor="review-comment">Review comment</label><textarea id="review-comment" className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" value={comment} onChange={(event) => setComment(event.target.value)} /><button disabled={busy || !comment.trim()} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50" onClick={() => run(async () => { await addCorrectionReviewComment({ requestId: request.id, comment }); setComment(""); })}>Add comment</button></div>
        <div className="space-y-2"><label className="text-sm font-medium" htmlFor="evidence-request">Request more evidence · reason required</label><textarea id="evidence-request" className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" value={evidenceReason} onChange={(event) => setEvidenceReason(event.target.value)} /><button disabled={busy || evidenceReason.trim().length < 10} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50" onClick={() => run(async () => { await requestCorrectionEvidence({ requestId: request.id, reason: evidenceReason }); setEvidenceReason(""); })}>Request evidence</button></div>
        <div className="space-y-2"><label className="text-sm font-medium" htmlFor="recommendation">Recommendation</label><select id="recommendation" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={recommendation} onChange={(event) => setRecommendation(event.target.value as typeof recommendation)}><option value="RECOMMEND_APPROVAL">Recommend approval</option><option value="RECOMMEND_REJECTION">Recommend rejection</option></select><textarea aria-label="Recommendation reason" className="min-h-16 w-full rounded-md border bg-background p-3 text-sm" placeholder="Reason required" value={recommendationReason} onChange={(event) => setRecommendationReason(event.target.value)} /><button disabled={busy || recommendationReason.trim().length < 10 || request.status !== "under_review"} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50" onClick={() => run(() => recommendTaxpayerCorrection({ requestId: request.id, recommendation, reason: recommendationReason }))}>Submit recommendation</button></div>
      </div>
      <p className="text-xs text-muted-foreground">A recommendation is advisory. It does not approve/reject the correction or change the taxpayer record.</p>
    </section> : <section className="rounded-lg border bg-card p-5"><h2 className="font-semibold">Recommendation recorded</h2><p className="mt-2 text-sm">{request.recommendation?.replaceAll("_", " ")}</p><p className="mt-1 text-sm text-muted-foreground">{request.recommendationReason}</p><p className="mt-3 text-xs text-muted-foreground">Awaiting a formally authorized independent final approver; no taxpayer data has been changed.</p></section>}
    <section className="rounded-lg border bg-card p-5"><h2 className="font-semibold">Immutable review history</h2><ol className="mt-3 space-y-3">{events.map((event) => <li key={event.id} className="border-l-2 pl-3"><p className="text-sm font-medium">{event.eventType.replaceAll("_", " ")}</p>{event.reason ? <p className="text-sm text-muted-foreground">{event.reason}</p> : null}<p className="text-xs text-muted-foreground">{event.createdAt.toLocaleString()}</p></li>)}</ol></section>
  </>;
}
