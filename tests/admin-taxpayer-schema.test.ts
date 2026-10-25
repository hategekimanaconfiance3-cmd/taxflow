import assert from "node:assert/strict";
import { test } from "node:test";
import { editTaxpayerSchema, updateClearanceStatusSchema } from "../lib/validation/admin-taxpayer.schema";

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
