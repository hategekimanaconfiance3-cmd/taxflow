"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addCorrectionReviewComment,
  recommendTaxpayerCorrection,
  requestCorrectionEvidence,
  applyTaxpayerCorrection,
} from "@/lib/actions/taxpayer-correction.action";

type Review = {
  request: {
    id: string; reference: string; category: string; fieldKey: string;
    originalValue: string; requestedValue: string; reason: string; status: string;
    recommendation: string | null; recommendationReason: string | null;
    appliedValue: string | null; appliedAt: Date | null;
    createdAt: Date;
  };
  taxpayerName: string; tin: string | null; businessName: string | null;
  events: Array<{
    id: string; eventType: string; fromStatus: string | null; toStatus: string | null;
    reason: string | null; details: Record<string, unknown>; createdAt: Date;
  }>;
  evidence: Array<{ id: string; filename: string; sizeBytes: number; createdAt: Date }>;
  isSuperAdmin: boolean;
};

const FIELD_LABELS: Record<string, string> = {
  name: "Personal Name",
  businessName: "Business Name",
  email: "Email Address",
  phoneNumber: "Phone Number",
  businessType: "Business Type",
};

const EVENT_LABELS: Record<string, string> = {
  REQUEST_SUBMITTED: "Request Submitted",
  REQUEST_ASSIGNED: "Request Assigned",
  REQUEST_REASSIGNED: "Request Reassigned",
  REVIEW_COMMENT_ADDED: "Review Comment Added",
  ADDITIONAL_EVIDENCE_REQUESTED: "Additional Evidence Requested",
  ADDITIONAL_EVIDENCE_SUBMITTED: "Additional Evidence Submitted",
  RECOMMEND_APPROVAL: "Recommended for Approval",
  RECOMMEND_REJECTION: "Recommended for Rejection",
  CORRECTION_APPLIED: "Correction Applied",
};

export function TaxpayerCorrectionReview({ correction }: { correction: Review }) {
  const { request, events, evidence, isSuperAdmin } = correction;
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [comment, setComment] = useState("");
  const [evidenceReason, setEvidenceReason] = useState("");
  const [recommendation, setRecommendation] = useState<"RECOMMEND_APPROVAL" | "RECOMMEND_REJECTION">("RECOMMEND_APPROVAL");
  const [recommendationReason, setRecommendationReason] = useState("");
  const [applyValue, setApplyValue] = useState(request.requestedValue);
  const [applyReason, setApplyReason] = useState("");
  const [confirmApply, setConfirmApply] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const run = (operation: () => Promise<unknown>, successText?: string) =>
    startTransition(async () => {
      setError("");
      setSuccessMsg("");
      try {
        await operation();
        if (successText) setSuccessMsg(successText);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The request could not be updated.");
      }
    });

  const isOpen = ["under_review", "awaiting_evidence", "recommended_approval", "recommended_rejection"].includes(request.status);
  const isApplied = request.status === "applied";
  const canApply = isOpen || (isSuperAdmin && !isApplied);

  const statusBadgeClass = {
    submitted: "bg-yellow-100 text-yellow-800",
    under_review: "bg-blue-100 text-blue-800",
    awaiting_evidence: "bg-orange-100 text-orange-800",
    recommended_approval: "bg-emerald-100 text-emerald-800",
    recommended_rejection: "bg-red-100 text-red-800",
    applied: "bg-green-100 text-green-800",
  }[request.status] ?? "bg-muted text-muted-foreground";

  return (
    <>
      <Link href="/admin/corrections" className="text-sm underline">← Correction requests</Link>

      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{request.reference}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {FIELD_LABELS[request.fieldKey] ?? request.fieldKey} correction · Submitted {request.createdAt.toLocaleDateString()}
          </p>
        </div>
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass}`}>
          {request.status.replaceAll("_", " ").toUpperCase()}
        </span>
      </header>

      {/* Alerts */}
      {error && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <strong>Error:</strong> {error}
        </div>
      )}
      {successMsg && (
        <div role="status" className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-800">
          ✓ {successMsg}
        </div>
      )}

      {/* Applied banner */}
      {isApplied && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-5">
          <h2 className="font-semibold text-green-900">✓ Correction Applied</h2>
          <p className="mt-1 text-sm text-green-800">
            Field <strong>{FIELD_LABELS[request.fieldKey]}</strong> was updated to:{" "}
            <span className="font-mono font-semibold">{request.appliedValue}</span>
          </p>
          {request.appliedAt && (
            <p className="mt-1 text-xs text-green-700">Applied on {request.appliedAt.toLocaleString()}</p>
          )}
        </div>
      )}

      {/* Taxpayer + request details */}
      <section className="grid gap-4 rounded-lg border bg-card p-5 sm:grid-cols-2">
        <div>
          <h2 className="font-semibold">Taxpayer</h2>
          <p className="mt-2">{correction.taxpayerName}</p>
          <p className="text-sm text-muted-foreground">TIN: {correction.tin ?? "Unavailable"}</p>
          <p className="text-sm text-muted-foreground">Business: {correction.businessName ?? "Not recorded"}</p>
        </div>
        <div>
          <h2 className="font-semibold">Request details</h2>
          <p className="mt-2 text-sm">Category: {request.category.replaceAll("_", " ")}</p>
          <p className="text-sm">Field: <strong>{FIELD_LABELS[request.fieldKey] ?? request.fieldKey}</strong></p>
          <p className="mt-2 text-sm text-muted-foreground">Taxpayer reason: {request.reason}</p>
        </div>
        <div className="rounded border p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Current recorded value</p>
          <p className="mt-2 break-words font-mono">{request.originalValue || "(empty)"}</p>
        </div>
        <div className="rounded border border-primary/30 bg-primary/5 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Taxpayer-requested value · not yet applied</p>
          <p className="mt-2 break-words font-mono">{request.requestedValue}</p>
        </div>
      </section>

      {/* Evidence */}
      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold">Supporting evidence</h2>
        {!evidence.length ? (
          <p className="mt-2 text-sm text-muted-foreground">No evidence attached.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {evidence.map((file) => (
              <li key={file.id} className="flex items-center justify-between gap-3 text-sm">
                <span>{file.filename} · {(file.sizeBytes / 1024).toFixed(0)} KB</span>
                <a className="underline" href={`/api/corrections/evidence/${file.id}`} target="_blank" rel="noreferrer">
                  Open securely
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── APPLY CORRECTION PANEL ─────────────────────────────────────── */}
      {canApply && (
        <section className="rounded-lg border-2 border-primary bg-card p-5">
          <div className="flex items-center gap-2">
            <span className="text-lg">✏️</span>
            <h2 className="font-semibold text-primary">
              Edit &amp; Apply Taxpayer Information
              {isSuperAdmin && <span className="ml-2 rounded bg-primary/10 px-2 py-0.5 text-xs font-normal text-primary">Super Admin Override Available</span>}
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Directly update the taxpayer&apos;s <strong>{FIELD_LABELS[request.fieldKey]}</strong> field.
            Every change is recorded with your identity, timestamp, previous value, and new value in the immutable audit trail.
            The taxpayer will be notified immediately.
          </p>

          <div className="mt-4 space-y-4">
            {/* Value to apply */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="apply-value">
                Corrected value for <strong>{FIELD_LABELS[request.fieldKey]}</strong>
              </label>
              <div className="flex gap-2">
                <input
                  id="apply-value"
                  type="text"
                  className="flex-1 rounded-md border bg-background px-3 py-2 text-sm font-mono"
                  value={applyValue}
                  onChange={(e) => setApplyValue(e.target.value)}
                  placeholder="Enter the verified correct value"
                />
                <button
                  type="button"
                  className="rounded-md border px-3 py-2 text-xs text-muted-foreground hover:bg-accent"
                  onClick={() => setApplyValue(request.requestedValue)}
                >
                  Use requested
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Original: <span className="font-mono">{request.originalValue || "(empty)"}</span>
                {" · "}Requested: <span className="font-mono">{request.requestedValue}</span>
              </p>
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="apply-reason">
                Reason for this correction <span className="text-destructive">*</span>
              </label>
              <textarea
                id="apply-reason"
                className="min-h-20 w-full rounded-md border bg-background p-3 text-sm"
                value={applyReason}
                onChange={(e) => setApplyReason(e.target.value)}
                placeholder="Describe why this correction is being applied and what verification was performed (minimum 10 characters)..."
              />
              <p className="text-xs text-muted-foreground">{applyReason.trim().length}/10 minimum · {applyReason.trim().length}/2000 maximum</p>
            </div>

            {/* Confirmation checkbox */}
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-amber-50 p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 cursor-pointer"
                checked={confirmApply}
                onChange={(e) => setConfirmApply(e.target.checked)}
              />
              <span>
                I confirm that I have verified the corrected information is accurate. I understand this action will
                immediately update the taxpayer&apos;s official record and cannot be undone through this interface.
                My administrator identity and the timestamp will be permanently recorded.
              </span>
            </label>

            {/* Apply button */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={busy || !confirmApply || applyValue.trim().length < 1 || applyReason.trim().length < 10}
                className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-40 hover:bg-primary/90"
                onClick={() =>
                  run(
                    () => applyTaxpayerCorrection({ requestId: request.id, correctedValue: applyValue.trim(), reason: applyReason.trim() }),
                    "Correction applied successfully. The taxpayer has been notified."
                  )
                }
              >
                {busy ? "Applying…" : "Apply Correction"}
              </button>
              <p className="text-xs text-muted-foreground">
                {isSuperAdmin ? "Super Admin override — applies to any request regardless of assignment." : "Only available for your assigned request."}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Review actions (comment / evidence / recommendation) — only while open */}
      {isOpen ? (
        <section className="space-y-4 rounded-lg border bg-card p-5">
          <h2 className="font-semibold">Review actions</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {/* Comment */}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="review-comment">Review comment</label>
              <textarea
                id="review-comment"
                className="min-h-24 w-full rounded-md border bg-background p-3 text-sm"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <button
                disabled={busy || !comment.trim()}
                className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                onClick={() => run(async () => { await addCorrectionReviewComment({ requestId: request.id, comment }); setComment(""); })}
              >
                Add comment
              </button>
            </div>
            {/* Evidence request */}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="evidence-request">Request more evidence · reason required</label>
              <textarea
                id="evidence-request"
                className="min-h-24 w-full rounded-md border bg-background p-3 text-sm"
                value={evidenceReason}
                onChange={(e) => setEvidenceReason(e.target.value)}
              />
              <button
                disabled={busy || evidenceReason.trim().length < 10}
                className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                onClick={() => run(async () => { await requestCorrectionEvidence({ requestId: request.id, reason: evidenceReason }); setEvidenceReason(""); })}
              >
                Request evidence
              </button>
            </div>
            {/* Recommendation */}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="recommendation">Recommendation</label>
              <select
                id="recommendation"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={recommendation}
                onChange={(e) => setRecommendation(e.target.value as typeof recommendation)}
              >
                <option value="RECOMMEND_APPROVAL">Recommend approval</option>
                <option value="RECOMMEND_REJECTION">Recommend rejection</option>
              </select>
              <textarea
                aria-label="Recommendation reason"
                className="min-h-16 w-full rounded-md border bg-background p-3 text-sm"
                placeholder="Reason required"
                value={recommendationReason}
                onChange={(e) => setRecommendationReason(e.target.value)}
              />
              <button
                disabled={busy || recommendationReason.trim().length < 10 || request.status !== "under_review"}
                className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
                onClick={() => run(() => recommendTaxpayerCorrection({ requestId: request.id, recommendation, reason: recommendationReason }))}
              >
                Submit recommendation
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">A recommendation is advisory. Use &quot;Apply Correction&quot; above to execute the actual change.</p>
        </section>
      ) : !isApplied ? (
        <section className="rounded-lg border bg-card p-5">
          <h2 className="font-semibold">Recommendation recorded</h2>
          <p className="mt-2 text-sm">{request.recommendation?.replaceAll("_", " ")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{request.recommendationReason}</p>
          <p className="mt-3 text-xs text-muted-foreground">Use &quot;Apply Correction&quot; above to execute the change and complete this request.</p>
        </section>
      ) : null}

      {/* Immutable review history */}
      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold">Immutable review history</h2>
        <ol className="mt-3 space-y-3">
          {events.map((event) => {
            const details = event.details as Record<string, unknown> | null;
            const isCorrectionApplied = event.eventType === "CORRECTION_APPLIED";
            return (
              <li
                key={event.id}
                className={`border-l-2 pl-3 ${isCorrectionApplied ? "border-green-400" : "border-border"}`}
              >
                <p className="text-sm font-medium">
                  {EVENT_LABELS[event.eventType] ?? event.eventType.replaceAll("_", " ")}
                  {isCorrectionApplied && <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800">Applied</span>}
                </p>
                {event.reason && <p className="text-sm text-muted-foreground">{event.reason}</p>}
                {isCorrectionApplied && details && (
                  <div className="mt-1 rounded bg-muted/50 p-2 text-xs font-mono">
                    <span className="text-muted-foreground">Field: </span>{String(details.fieldKey ?? "")}
                    <br />
                    <span className="text-muted-foreground">Before: </span>{String(details.previousValue ?? "(empty)")}
                    <br />
                    <span className="text-muted-foreground">After: </span>
                    <span className="font-semibold text-green-700">{String(details.appliedValue ?? "")}</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{event.createdAt.toLocaleString()}</p>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}
