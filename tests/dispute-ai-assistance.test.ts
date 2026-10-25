import assert from "node:assert/strict";
import { test } from "node:test";
import { disputeAiAssistanceSchema } from "../lib/validation/dispute-ai-assistance.schema";

test("dispute AI help only accepts drafting, improvement, or advisory suggestion tasks", () => {
  const disputeId = "8ddc7bb4-4c27-4578-b9d4-7df97137ed0c";
  for (const task of ["internal_notes", "official_communication", "suggestions"] as const) {
    assert.equal(disputeAiAssistanceSchema.safeParse({ disputeId, task }).success, true);
  }
  assert.equal(disputeAiAssistanceSchema.safeParse({ disputeId, task: "approve_dispute" }).success, false);
  assert.equal(disputeAiAssistanceSchema.safeParse({ disputeId: "not-a-uuid", task: "suggestions" }).success, false);
});

test("dispute AI input rejects oversized drafts and invalid price adjustments", () => {
  const base = {
    disputeId: "8ddc7bb4-4c27-4578-b9d4-7df97137ed0c",
    task: "official_communication",
    action: "adjust_amount",
  };
  assert.equal(disputeAiAssistanceSchema.safeParse({ ...base, adjustedUnitPrice: 1500 }).success, true);
  assert.equal(disputeAiAssistanceSchema.safeParse({ ...base, adjustedUnitPrice: -1 }).success, false);
  assert.equal(disputeAiAssistanceSchema.safeParse({ ...base, existingDraft: "x".repeat(6001) }).success, false);
});
