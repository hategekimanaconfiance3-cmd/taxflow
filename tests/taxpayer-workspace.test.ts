import assert from "node:assert/strict";
import { test } from "node:test";
import { hasRRAPermission } from "../lib/rra-rbac";
import { taxpayerAccessReasonSchema } from "../lib/validation/taxpayer-workspace.schema";

test("taxpayer access reasons accept approved purposes and reject arbitrary values", () => {
  assert.equal(taxpayerAccessReasonSchema.safeParse("customer_support").success, true);
  assert.equal(taxpayerAccessReasonSchema.safeParse("audit").success, true);
  assert.equal(taxpayerAccessReasonSchema.safeParse("make_decision").success, false);
  assert.equal(taxpayerAccessReasonSchema.safeParse("").success, false);
});

test("taxpayer workspace record categories follow existing RRA permissions", () => {
  assert.equal(hasRRAPermission("tax_compliance_officer", "support.manage"), true);
  assert.equal(hasRRAPermission("tax_compliance_officer", "transaction.read"), false);
  assert.equal(hasRRAPermission("audit_investigation_officer", "transaction.read"), true);
  assert.equal(hasRRAPermission("audit_investigation_officer", "payments.read"), false);
  assert.equal(hasRRAPermission("product_traceability_officer", "stock.read"), true);
  assert.equal(hasRRAPermission("product_traceability_officer", "tax.records.read"), false);
  assert.equal(hasRRAPermission("super_admin", "taxpayer.intelligence.search"), false);
});
