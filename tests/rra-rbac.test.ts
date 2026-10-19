import assert from "node:assert/strict";
import { test } from "node:test";
import {
    hasRRAPermission,
    isRRARoleAllowed,
    isRRARole,
    RRA_ROLE_OPTIONS,
} from "../lib/rra-rbac";
import { staffAssignmentRoleSchema } from "../lib/validation/staff.schema";

test("all eight proposed RRA roles are defined and labels remain configurable", () => {
    assert.equal(RRA_ROLE_OPTIONS.length, 8);
    assert.deepEqual(RRA_ROLE_OPTIONS.map((role) => role.value), [
        "super_admin",
        "director_executive",
        "tax_compliance_officer",
        "audit_investigation_officer",
        "product_traceability_officer",
        "customs_import_officer",
        "payments_reconciliation_officer",
        "data_ai_analyst",
    ]);
});

test("role permissions follow least privilege and super admin is not an implicit bypass", () => {
    assert.equal(hasRRAPermission("super_admin", "staff.manage"), true);
    assert.equal(hasRRAPermission("super_admin", "tax.records.read"), false);
    assert.equal(hasRRAPermission("super_admin", "reports.aggregate.read"), false);
    assert.equal(hasRRAPermission("director_executive", "reports.aggregate.read"), true);
    assert.equal(hasRRAPermission("data_ai_analyst", "reports.aggregate.read"), true);
    assert.equal(hasRRAPermission("super_admin", "ai.assistant.use"), false);
    assert.equal(hasRRAPermission("director_executive", "payments.reconcile"), false);
    assert.equal(hasRRAPermission("customs_import_officer", "imports.review"), true);
    assert.equal(hasRRAPermission("customs_import_officer", "payments.reconcile"), false);
});

test("new staff roles are accepted only by matching legacy route guards", () => {
    assert.equal(isRRARoleAllowed("product_traceability_officer", ["stock_officer"]), true);
    assert.equal(isRRARoleAllowed("audit_investigation_officer", ["audit_officer"]), true);
    assert.equal(isRRARoleAllowed("super_admin", ["stock_officer"]), false);
    assert.equal(isRRARoleAllowed("super_admin", ["super_admin"]), true);
    assert.equal(isRRARoleAllowed("director_executive", ["reporting_officer"]), false);
});

test("legacy staff roles remain recognized during transition", () => {
    assert.equal(isRRARole("reporting_officer"), true);
    assert.equal(isRRARole("unrecognized_role"), false);
    assert.equal(isRRARole("manufacturer"), false);
});

test("new staff accounts can only be assigned one of the eight proposed roles", () => {
    for (const role of RRA_ROLE_OPTIONS) assert.equal(staffAssignmentRoleSchema.safeParse(role.value).success, true);
    assert.equal(staffAssignmentRoleSchema.safeParse("compliance_officer").success, false);
});
