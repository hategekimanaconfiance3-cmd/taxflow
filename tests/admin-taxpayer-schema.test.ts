import assert from "node:assert/strict";
import { test } from "node:test";
import { editTaxpayerSchema, getAllowedClearanceTransitions, taxpayerRecordIdSchema, updateClearanceStatusSchema } from "../lib/validation/admin-taxpayer.schema";

const validEdit = {
  traderId: "taxpayer-1",
  name: "Example Owner",
  businessName: "Example Traders Ltd",
  phoneNumber: "+250788123456",
  email: "owner@example.rw",
  reason: "Corrected the registered business contact details.",
};

test("taxpayer edit schema accepts valid profile changes and a reason", () => {
  assert.equal(editTaxpayerSchema.safeParse(validEdit).success, true);
});

test("taxpayer edit schema rejects missing reason, invalid email, and unexpected fields", () => {
  assert.equal(editTaxpayerSchema.safeParse({ ...validEdit, reason: "short" }).success, false);
  assert.equal(editTaxpayerSchema.safeParse({ ...validEdit, email: "not-an-email" }).success, false);
  assert.equal(editTaxpayerSchema.safeParse({ ...validEdit, admin: true }).success, false);
});

test("clearance changes require a valid status, target ID, and human reason", () => {
  assert.equal(updateClearanceStatusSchema.safeParse({ traderId: "taxpayer-1", status: "suspended", reason: "Evidence requires a formal compliance review." }).success, true);
  assert.equal(updateClearanceStatusSchema.safeParse({ traderId: "taxpayer-1", status: "fraud", reason: "Evidence requires a formal compliance review." }).success, false);
  assert.equal(updateClearanceStatusSchema.safeParse({ traderId: "taxpayer-1", status: "approved", reason: "ok" }).success, false);
});

test("clearance transitions allow review, suspension, approval, and reinstatement but reject invalid transitions", () => {
  assert.deepEqual(getAllowedClearanceTransitions("pending"), ["approved", "under_review", "suspended"]);
  assert.deepEqual(getAllowedClearanceTransitions("approved"), ["under_review", "suspended"]);
  assert.deepEqual(getAllowedClearanceTransitions("under_review"), ["approved", "suspended"]);
  assert.deepEqual(getAllowedClearanceTransitions("suspended"), ["approved", "under_review"]);
  assert.deepEqual(getAllowedClearanceTransitions("unknown"), []);
  assert.equal((getAllowedClearanceTransitions("approved") as readonly string[]).includes("pending"), false);
});

test("taxpayer record route IDs accept the database text ID format and reject blank or oversized values", () => {
  assert.equal(taxpayerRecordIdSchema.safeParse("user_abc-123").success, true);
  assert.equal(taxpayerRecordIdSchema.safeParse("550e8400-e29b-41d4-a716-446655440000").success, true);
  assert.equal(taxpayerRecordIdSchema.safeParse(" ").success, false);
  assert.equal(taxpayerRecordIdSchema.safeParse("x".repeat(129)).success, false);
});
