import { getAIFeedbackForReview } from "@/lib/actions/ai-feedback.action";
import { AIFeedbackReview } from "@/components/admin/ai-feedback-review";

export default async function AIFeedbackPage() {
  const rows = await getAIFeedbackForReview();
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">AI Feedback Review</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review staff ratings and decide which cases should enter the evaluation set. Chat text is not stored.</p>
      </div>
      <AIFeedbackReview rows={rows} />
    </div>
  );
}
