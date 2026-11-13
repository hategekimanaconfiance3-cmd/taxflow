"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateFindingStatus, type FindingStatus } from "@/lib/actions/ai-finding.action";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function FindingReviewControls({
  findingId,
  status,
  canReview,
}: {
  findingId: string;
  status: FindingStatus;
  canReview: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function update(nextStatus: FindingStatus) {
    setMessage("");
    startTransition(async () => {
      const result = await updateFindingStatus(findingId, nextStatus, note || undefined);
      if (!result.success) {
        setMessage(result.error ?? "Unable to update finding.");
        return;
      }
      setMessage("Review status saved.");
      router.refresh();
    });
  }

  if (!canReview) return <span className="text-xs text-muted-foreground">View only</span>;

  return <div className="min-w-48 space-y-1.5">
    <Textarea aria-label="Reviewer note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={2} placeholder="Optional review note" />
    <div className="flex flex-wrap gap-1">
      {status !== "under_review" && <Button size="sm" variant="outline" disabled={pending} onClick={() => update("under_review")}>Review</Button>}
      {status !== "resolved" && <Button size="sm" variant="outline" disabled={pending} onClick={() => update("resolved")}>Resolve</Button>}
      {status !== "dismissed" && <Button size="sm" variant="ghost" disabled={pending} onClick={() => update("dismissed")}>Dismiss</Button>}
    </div>
    {message && <p role="status" className="text-[11px] text-muted-foreground">{message}</p>}
  </div>;
}
