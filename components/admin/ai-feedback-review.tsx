"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resolveAIFeedback, type AIFeedbackRow } from "@/lib/actions/ai-feedback.action";
import { Button } from "@/components/ui/button";

const outcomes = [
  ["added_to_eval", "Add to evaluation set"], ["follow_up", "Needs follow-up"],
  ["duplicate", "Duplicate"], ["no_action", "No action"],
] as const;

export function AIFeedbackReview({ rows }: { rows: AIFeedbackRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  const resolve = (feedbackId: string, outcome: (typeof outcomes)[number][0]): void => {
    startTransition(async () => {
      const result = await resolveAIFeedback({ feedbackId, outcome });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage("Feedback review saved.");
      router.refresh();
    });
  };

  if (rows.length === 0) return <p className="rounded-lg border p-6 text-sm text-muted-foreground">No AI feedback has been submitted.</p>;
  return (
    <div className="space-y-3">
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      {rows.map((row) => (
        <article key={row.id} className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium">{row.rating === "helpful" ? "Helpful" : `Needs review · ${row.issueCategory ?? "uncategorized"}`}</p>
              <p className="text-xs text-muted-foreground">{row.staffRole} · {row.modelVersion} · {row.createdAt.toLocaleString()}</p>
            </div>
            <span className="text-xs capitalize text-muted-foreground">{row.reviewStatus}{row.reviewOutcome ? ` · ${row.reviewOutcome.replaceAll("_", " ")}` : ""}</span>
          </div>
          {row.reviewStatus === "pending" && (
            <div className="mt-3 flex flex-wrap gap-2">
              {outcomes.map(([outcome, label]) => <Button key={outcome} size="sm" variant="outline" disabled={pending} onClick={() => resolve(row.id, outcome)}>{label}</Button>)}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
