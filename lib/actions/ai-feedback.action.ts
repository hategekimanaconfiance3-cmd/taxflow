"use server";

import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import db from "@/db/drizzle";
import { aiFeedback, auditLog } from "@/db/schema";
import { requireRRAPermission, requireRRASession } from "@/lib/auth-guard";
import { hasRRAPermission, isRRARole } from "@/lib/rra-rbac";

const issueCategories = ["incorrect", "incomplete", "unsupported", "wrong_tool", "unsafe", "other"] as const;
const reviewOutcomes = ["added_to_eval", "no_action", "duplicate", "follow_up"] as const;

const feedbackSchema = z.object({
  messageId: z.string().trim().min(1).max(128),
  rating: z.enum(["helpful", "not_helpful"]),
  issueCategory: z.enum(issueCategories).optional(),
}).strict().refine((value) => value.rating === "not_helpful" ? value.issueCategory !== undefined : value.issueCategory === undefined, {
  message: "Choose an issue category for negative feedback.",
});

const resolutionSchema = z.object({
  feedbackId: z.string().uuid(),
  outcome: z.enum(reviewOutcomes),
}).strict();

export interface AIFeedbackRow {
  id: string;
  staffRole: string;
  rating: string;
  issueCategory: string | null;
  reviewStatus: string;
  reviewOutcome: string | null;
  modelVersion: string;
  createdAt: Date;
}

export async function submitAIFeedback(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Select a rating and, if needed, an issue category." };

  const session = await requireRRASession();
  const role = session.staff.clearanceLevel;
  if (!isRRARole(role) || !hasRRAPermission(role, "ai.assistant.use")) {
    return { ok: false, error: "You are not authorized to submit assistant feedback." };
  }

  const messageHash = createHash("sha256").update(`${session.user.id}:${parsed.data.messageId}`).digest("hex");
  const modelVersion = process.env.GOOGLE_GENERATIVE_AI_MODEL?.trim() || "gemini-3.6-flash";
  try {
    await db.transaction(async (tx) => {
      await tx.insert(aiFeedback).values({
        submittedById: session.user.id,
        staffRole: role,
        messageHash,
        rating: parsed.data.rating,
        issueCategory: parsed.data.issueCategory ?? null,
        modelVersion,
      });
      await tx.insert(auditLog).values({
        userId: session.user.id,
        action: "AI_FEEDBACK_SUBMITTED",
        targetType: "ai_feedback",
        targetId: messageHash,
        metadata: JSON.stringify({ role, rating: parsed.data.rating, issueCategory: parsed.data.issueCategory ?? null }),
      });
    });
    return { ok: true };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return { ok: false, error: "Feedback for this response was already recorded." };
    }
    console.error("AI feedback submission failed", error);
    return { ok: false, error: "Feedback could not be saved. Please try again." };
  }
}

export async function getAIFeedbackForReview(): Promise<AIFeedbackRow[]> {
  await requireRRAPermission("ai.feedback.review");
  return db.select({
    id: aiFeedback.id,
    staffRole: aiFeedback.staffRole,
    rating: aiFeedback.rating,
    issueCategory: aiFeedback.issueCategory,
    reviewStatus: aiFeedback.reviewStatus,
    reviewOutcome: aiFeedback.reviewOutcome,
    modelVersion: aiFeedback.modelVersion,
    createdAt: aiFeedback.createdAt,
  }).from(aiFeedback).orderBy(desc(aiFeedback.createdAt)).limit(100);
}

export async function resolveAIFeedback(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = resolutionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid feedback review." };
  const session = await requireRRAPermission("ai.feedback.review");
  try {
    await db.transaction(async (tx) => {
      const [updated] = await tx.update(aiFeedback)
        .set({ reviewStatus: "reviewed", reviewOutcome: parsed.data.outcome, reviewedById: session.user.id, reviewedAt: new Date() })
        .where(and(eq(aiFeedback.id, parsed.data.feedbackId), eq(aiFeedback.reviewStatus, "pending")))
        .returning({ id: aiFeedback.id });
      if (!updated) throw new Error("Feedback is missing or already reviewed.");
      await tx.insert(auditLog).values({
        userId: session.user.id,
        action: "AI_FEEDBACK_REVIEWED",
        targetType: "ai_feedback",
        targetId: updated.id,
        metadata: JSON.stringify({ outcome: parsed.data.outcome }),
      });
    });
    return { ok: true };
  } catch (error) {
    console.error("AI feedback review failed", error);
    return { ok: false, error: "Feedback review could not be saved. Refresh and try again." };
  }
}
