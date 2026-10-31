import assert from "node:assert/strict";
import { test } from "node:test";
import { hasRRAPermission, RRA_PERMISSIONS, RRA_ROLE_PERMISSIONS, type RRAPermission } from "../lib/rra-rbac";

test("Correction Officers can review assigned requests but cannot assign or make final decisions", () => {
  for (const permission of [
    "taxpayer.correction.read_assigned",
    "taxpayer.correction.read_evidence",
    "taxpayer.correction.request_evidence",
    "taxpayer.correction.add_review_comment",
    "taxpayer.correction.recommend",
  ] satisfies RRAPermission[]) {
    assert.equal(hasRRAPermission("correction_officer", permission), true, permission);
  }
  assert.equal(hasRRAPermission("correction_officer", "taxpayer.correction.assign"), false);
  assert.equal(hasRRAPermission("correction_officer", "tax.records.read"), false);
  assert.equal(hasRRAPermission("correction_officer", "payments.read"), false);
  assert.equal(hasRRAPermission("correction_officer", "staff.manage"), false);
});

test("Super Admin has an explicit assignment permission but no implicit final correction decision", () => {
  assert.equal(hasRRAPermission("super_admin", "taxpayer.correction.assign"), true);
  assert.equal(RRA_ROLE_PERMISSIONS.super_admin.includes("taxpayer.correction.assign"), true);
  assert.equal((RRA_PERMISSIONS as readonly string[]).includes("taxpayer.correction.approve"), false);
  assert.equal((RRA_PERMISSIONS as readonly string[]).includes("taxpayer.correction.reject"), false);
});
