"use client";

import { useState, useTransition } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { submitAIFeedback } from "@/lib/actions/ai-feedback.action";
import { Button } from "@/components/ui/button";

const categories = [
  ["incorrect", "Incorrect"], ["incomplete", "Incomplete"], ["unsupported", "Unsupported claim"],
  ["wrong_tool", "Wrong data or tool"], ["unsafe", "Unsafe recommendation"], ["other", "Other issue"],
] as const;

export function AIFeedbackControl({ messageId }: { messageId: string }) {
  const [category, setCategory] = useState("");
  const [state, setState] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = (rating: "helpful" | "not_helpful"): void => {
    if (rating === "not_helpful" && !category) {
      return;
    }
    startTransition(async () => {
      const result = await submitAIFeedback({ messageId, rating, ...(rating === "not_helpful" ? { issueCategory: category } : {}) });
      setState(result.ok ? "Thanks for the feedback." : result.error);
    });
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-2" aria-label="Rate this AI response">
      <span className="text-xs text-muted-foreground">Was this response useful?</span>
      <Button type="button" size="sm" variant="ghost" disabled={pending || !!state} onClick={() => submit("helpful")} aria-label="Helpful">
        <ThumbsUp className="h-3.5 w-3.5" />
      </Button>
      <select aria-label="Issue category" className="h-8 rounded-md border bg-background px-2 text-xs" value={category} onChange={(event) => setCategory(event.target.value)} disabled={pending || !!state}>
        <option value="">Issue category</option>
        {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <Button type="button" size="sm" variant="ghost" disabled={pending || !!state} onClick={() => submit("not_helpful")} aria-label="Not helpful">
        <ThumbsDown className="h-3.5 w-3.5" />
      </Button>
      {state && <span role="status" className="text-xs text-muted-foreground">{state}</span>}
    </div>
  );
}
