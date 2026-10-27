/**
 * Tests for the RRA Role-Based Access Control (RBAC) module.
 *
 * These tests cover the pure logic layer in lib/rra-rbac.ts and
 * lib/validation/staff.schema.ts. No database or HTTP calls are made.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    hasRRAPermission,
    hasOperationalRRAPermission,
    getOperationalRRARolesWithAnyPermission,
    isRRARoleAllowed,
    isRRARole,
    RRA_ROLE_OPTIONS,
    RRA_PERMISSIONS,
    RRA_ROLE_VALUES,
    type RRARole,
    type RRAPermission,
} from "../lib/rra-rbac";
import { staffAssignmentRoleSchema } from "../lib/validation/staff.schema";
import { getAdminSidebarGroups } from "../lib/admin-sidebar-config";

// ---------------------------------------------------------------------------
// Role catalogue
// ---------------------------------------------------------------------------

test("exactly 8 proposed RRA roles are defined in the expected order", () => {
    assert.equal(RRA_ROLE_OPTIONS.length, 8);
    assert.deepEqual(RRA_ROLE_OPTIONS.map((r) => r.value), [
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

test("all role values (proposed + legacy) are accessible via RRA_ROLE_VALUES", () => {
    const expected: RRARole[] = [
        "super_admin",
        "director_executive",
        "tax_compliance_officer",
        "audit_investigation_officer",
        "product_traceability_officer",
        "customs_import_officer",
        "payments_reconciliation_officer",
        "data_ai_analyst",
        "compliance_officer",
        "audit_officer",
        "stock_officer",
        "correction_officer",
        "reporting_officer",
    ];
    for (const role of expected) {
        assert.ok(
            (RRA_ROLE_VALUES as readonly string[]).includes(role),
            `Expected ${role} to be in RRA_ROLE_VALUES`,
        );
    }
});

// ---------------------------------------------------------------------------
// isRRARole
// ---------------------------------------------------------------------------

test("isRRARole returns true for all valid roles", () => {
    for (const role of RRA_ROLE_VALUES) {
        assert.ok(isRRARole(role), `Expected isRRARole(${role}) === true`);
    }
});

test("isRRARole returns false for trader roles and unknown strings", () => {
    const invalid = ["manufacturer", "wholesaler", "retailer", "unrecognized_role", "", "admin"];
    for (const v of invalid) {
        assert.equal(isRRARole(v), false, `Expected isRRARole("${v}") === false`);
    }
});

// ---------------------------------------------------------------------------
// Least-privilege: super_admin has ALL permissions (post-hardening)
// ---------------------------------------------------------------------------

test("super_admin has every defined permission after hardening", () => {
    for (const perm of RRA_PERMISSIONS) {
        assert.ok(
            hasRRAPermission("super_admin", perm as RRAPermission),
            `super_admin should have permission: ${perm}`,
        );
    }
});

test("super_admin receives operational access through its full assigned permission grant", () => {
    assert.equal(hasOperationalRRAPermission(["super_admin"], "taxpayer.intelligence.search"), true);
    assert.equal(hasOperationalRRAPermission(["super_admin"], "taxpayer.compliance.read"), true);
    assert.equal(hasOperationalRRAPermission(["super_admin", "tax_compliance_officer"], "taxpayer.intelligence.search"), true);
    assert.equal(getOperationalRRARolesWithAnyPermission(["taxpayer.intelligence.search"]).includes("super_admin"), true);
    assert.equal(isRRARoleAllowed("super_admin", ["audit_officer"]), true);
});

// ---------------------------------------------------------------------------
// Per-role permission matrix — positive grants
// ---------------------------------------------------------------------------

test("director_executive: read-only executive dashboard and AI assistant", () => {
    assert.ok(hasRRAPermission("director_executive", "dashboard.executive.read"));
    assert.ok(hasRRAPermission("director_executive", "reports.aggregate.read"));
    assert.ok(hasRRAPermission("director_executive", "supply_chain.summary.read"));
    assert.ok(hasRRAPermission("director_executive", "ai.assistant.use"));
});

test("tax_compliance_officer: compliance read + follow-up + support", () => {
    assert.ok(hasRRAPermission("tax_compliance_officer", "taxpayer.compliance.read"));
    assert.ok(hasRRAPermission("tax_compliance_officer", "tax.records.read"));
    assert.ok(hasRRAPermission("tax_compliance_officer", "payments.read"));
    assert.ok(hasRRAPermission("tax_compliance_officer", "compliance.followup.manage"));
    assert.ok(hasRRAPermission("tax_compliance_officer", "support.manage"));
    assert.ok(hasRRAPermission("tax_compliance_officer", "ai.assistant.use"));
    assert.ok(hasRRAPermission("tax_compliance_officer", "taxpayer.profile.update"));
    assert.ok(hasRRAPermission("tax_compliance_officer", "taxpayer.clearance.update"));
});

test("reporting officers can read support tickets but cannot manage them", () => {
    assert.ok(hasOperationalRRAPermission(["reporting_officer"], "support.read"));
    assert.equal(hasOperationalRRAPermission(["reporting_officer"], "support.manage"), false);
    assert.equal(hasOperationalRRAPermission(["super_admin"], "support.read"), true);
    assert.equal(hasOperationalRRAPermission(["super_admin"], "support.manage"), true);
});

test("Support Tickets navigation is visible exactly to roles with operational support.read", () => {
    for (const role of RRA_ROLE_VALUES) {
        const visible = getAdminSidebarGroups([role])
            .flatMap((group) => group.items)
            .some((item) => item.href === "/admin/support");
        assert.equal(visible, hasOperationalRRAPermission([role], "support.read"), `Support Tickets navigation visibility for ${role}`);
        const canSearchTaxpayers = getAdminSidebarGroups([role])
            .flatMap((group) => group.items)
            .some((item) => item.href === "/admin/traders");
        assert.equal(canSearchTaxpayers, hasOperationalRRAPermission([role], "taxpayer.intelligence.search"), `Taxpayer search navigation visibility for ${role}`);
    }
});

test("audit_investigation_officer: case management, trail, traceability", () => {
    assert.ok(hasRRAPermission("audit_investigation_officer", "investigation.case.manage"));
    assert.ok(hasRRAPermission("audit_investigation_officer", "transaction.read"));
    assert.ok(hasRRAPermission("audit_investigation_officer", "audit.trail.read"));
    assert.ok(hasRRAPermission("audit_investigation_officer", "traceability.read"));
    assert.ok(hasRRAPermission("audit_investigation_officer", "ai.assistant.use"));
});

test("product_traceability_officer: traceability and stock read", () => {
    assert.ok(hasRRAPermission("product_traceability_officer", "traceability.read"));
    assert.ok(hasRRAPermission("product_traceability_officer", "stock.read"));
    assert.ok(hasRRAPermission("product_traceability_officer", "ai.assistant.use"));
});

test("customs_import_officer: imports read and review", () => {
    assert.ok(hasRRAPermission("customs_import_officer", "imports.read"));
    assert.ok(hasRRAPermission("customs_import_officer", "imports.review"));
    assert.ok(hasRRAPermission("customs_import_officer", "ai.assistant.use"));
});

test("payments_reconciliation_officer: payments read and reconcile", () => {
    assert.ok(hasRRAPermission("payments_reconciliation_officer", "tax.records.read"));
    assert.ok(hasRRAPermission("payments_reconciliation_officer", "payments.read"));
    assert.ok(hasRRAPermission("payments_reconciliation_officer", "payments.reconcile"));
    assert.ok(hasRRAPermission("payments_reconciliation_officer", "ai.assistant.use"));
});

test("data_ai_analyst: analytics, AI findings, data quality, feedback review", () => {
    assert.ok(hasRRAPermission("data_ai_analyst", "analytics.read"));
    assert.ok(hasRRAPermission("data_ai_analyst", "ai.findings.read"));
    assert.ok(hasRRAPermission("data_ai_analyst", "data_quality.read"));
    assert.ok(hasRRAPermission("data_ai_analyst", "reports.aggregate.read"));
    assert.ok(hasRRAPermission("data_ai_analyst", "ai.assistant.use"));
    assert.ok(hasRRAPermission("data_ai_analyst", "ai.feedback.review"));
});

// ---------------------------------------------------------------------------
// Least-privilege: denials — roles must NOT have permissions outside scope
// ---------------------------------------------------------------------------

test("director_executive cannot manage staff, configure system, or reconcile payments", () => {
    assert.equal(hasRRAPermission("director_executive", "staff.manage"), false);
    assert.equal(hasRRAPermission("director_executive", "system.configure"), false);
    assert.equal(hasRRAPermission("director_executive", "payments.reconcile"), false);
    assert.equal(hasRRAPermission("director_executive", "investigation.case.manage"), false);
    assert.equal(hasRRAPermission("director_executive", "imports.review"), false);
});

test("tax_compliance_officer cannot manage staff, configure system, or review AI feedback", () => {
    assert.equal(hasRRAPermission("tax_compliance_officer", "staff.manage"), false);
    assert.equal(hasRRAPermission("tax_compliance_officer", "system.configure"), false);
    assert.equal(hasRRAPermission("tax_compliance_officer", "ai.feedback.review"), false);
    assert.equal(hasRRAPermission("tax_compliance_officer", "payments.reconcile"), false);
});

test("audit_investigation_officer cannot manage staff, reconcile payments, or configure system", () => {
    assert.equal(hasRRAPermission("audit_investigation_officer", "staff.manage"), false);
    assert.equal(hasRRAPermission("audit_investigation_officer", "system.configure"), false);
    assert.equal(hasRRAPermission("audit_investigation_officer", "payments.reconcile"), false);
});

test("product_traceability_officer cannot access payments, imports review, or staff management", () => {
    assert.equal(hasRRAPermission("product_traceability_officer", "staff.manage"), false);
    assert.equal(hasRRAPermission("product_traceability_officer", "payments.reconcile"), false);
    assert.equal(hasRRAPermission("product_traceability_officer", "imports.review"), false);
    assert.equal(hasRRAPermission("product_traceability_officer", "investigation.case.manage"), false);
});

test("customs_import_officer cannot reconcile payments, manage staff, or read analytics", () => {
    assert.equal(hasRRAPermission("customs_import_officer", "staff.manage"), false);
    assert.equal(hasRRAPermission("customs_import_officer", "payments.reconcile"), false);
    assert.equal(hasRRAPermission("customs_import_officer", "analytics.read"), false);
    assert.equal(hasRRAPermission("customs_import_officer", "investigation.case.manage"), false);
});

test("payments_reconciliation_officer cannot manage staff, investigations, or AI feedback", () => {
    assert.equal(hasRRAPermission("payments_reconciliation_officer", "staff.manage"), false);
    assert.equal(hasRRAPermission("payments_reconciliation_officer", "system.configure"), false);
    assert.equal(hasRRAPermission("payments_reconciliation_officer", "investigation.case.manage"), false);
    assert.equal(hasRRAPermission("payments_reconciliation_officer", "ai.feedback.review"), false);
    assert.equal(hasRRAPermission("payments_reconciliation_officer", "imports.review"), false);
});

test("data_ai_analyst cannot manage staff, investigations, or reconcile payments", () => {
    assert.equal(hasRRAPermission("data_ai_analyst", "staff.manage"), false);
    assert.equal(hasRRAPermission("data_ai_analyst", "system.configure"), false);
    assert.equal(hasRRAPermission("data_ai_analyst", "investigation.case.manage"), false);
    assert.equal(hasRRAPermission("data_ai_analyst", "payments.reconcile"), false);
    assert.equal(hasRRAPermission("data_ai_analyst", "imports.review"), false);
});

// ---------------------------------------------------------------------------
// Legacy roles still recognized
// ---------------------------------------------------------------------------

test("legacy roles remain recognized after transition", () => {
    const legacyRoles = ["compliance_officer", "audit_officer", "stock_officer", "correction_officer", "reporting_officer"];
    for (const role of legacyRoles) {
        assert.ok(isRRARole(role), `Expected legacy role "${role}" to be recognized`);
    }
});

test("legacy compliance_officer has compliance and import review permissions", () => {
    assert.ok(hasRRAPermission("compliance_officer", "taxpayer.compliance.read"));
    assert.ok(hasRRAPermission("compliance_officer", "imports.review"));
    assert.ok(hasRRAPermission("compliance_officer", "compliance.followup.manage"));
    assert.ok(hasRRAPermission("compliance_officer", "ai.assistant.use"));
    assert.ok(hasRRAPermission("compliance_officer", "taxpayer.profile.update"));
    assert.ok(hasRRAPermission("compliance_officer", "taxpayer.clearance.update"));
});

test("super_admin operational access follows its assigned full permission set", () => {
    for (const permission of RRA_PERMISSIONS) {
        assert.equal(hasOperationalRRAPermission(["super_admin"], permission), true, `super_admin operational permission ${permission}`);
    }
    assert.equal(hasOperationalRRAPermission(["super_admin"], "taxpayer.profile.update"), true);
    assert.equal(hasOperationalRRAPermission(["super_admin"], "taxpayer.intelligence.search"), true);
    assert.equal(getOperationalRRARolesWithAnyPermission(["taxpayer.intelligence.search"]).includes("super_admin"), true);
    assert.equal(hasOperationalRRAPermission(["tax_compliance_officer"], "taxpayer.profile.update"), true);
    assert.equal(hasOperationalRRAPermission(["super_admin", "compliance_officer"], "taxpayer.clearance.update"), true);
    assert.equal(hasOperationalRRAPermission(["audit_officer"], "taxpayer.clearance.update"), false);
    assert.equal(hasOperationalRRAPermission(["super_admin"], "compliance.followup.manage"), true);
    assert.equal(hasOperationalRRAPermission(["tax_compliance_officer"], "compliance.followup.manage"), true);
    assert.equal(hasOperationalRRAPermission(["audit_investigation_officer"], "compliance.followup.manage"), false);
});

test("legacy audit_officer has audit trail and investigation permissions", () => {
    assert.ok(hasRRAPermission("audit_officer", "audit.trail.read"));
    assert.ok(hasRRAPermission("audit_officer", "investigation.case.manage"));
    assert.ok(hasRRAPermission("audit_officer", "traceability.read"));
});

test("legacy stock_officer has traceability and stock permissions only", () => {
    assert.ok(hasRRAPermission("stock_officer", "traceability.read"));
    assert.ok(hasRRAPermission("stock_officer", "stock.read"));
    assert.equal(hasRRAPermission("stock_officer", "staff.manage"), false);
    assert.equal(hasRRAPermission("stock_officer", "payments.reconcile"), false);
});

// ---------------------------------------------------------------------------
// isRRARoleAllowed — legacy guard alias compatibility
// ---------------------------------------------------------------------------

test("new roles satisfy legacy role guards via alias system", () => {
    // New role → legacy guard alias
    assert.ok(isRRARoleAllowed("product_traceability_officer", ["stock_officer"]));
    assert.ok(isRRARoleAllowed("audit_investigation_officer", ["audit_officer"]));
    assert.ok(isRRARoleAllowed("tax_compliance_officer", ["compliance_officer"]));
    assert.ok(isRRARoleAllowed("super_admin", ["super_admin"]));
});

test("ordinary roles do NOT satisfy unrelated legacy guards; super_admin keeps full access", () => {
    assert.equal(isRRARoleAllowed("director_executive", ["reporting_officer"]), false);
    assert.equal(isRRARoleAllowed("customs_import_officer", ["compliance_officer"]), false);
    assert.equal(isRRARoleAllowed("payments_reconciliation_officer", ["audit_officer"]), false);
    assert.equal(isRRARoleAllowed("data_ai_analyst", ["stock_officer"]), false);
    assert.equal(isRRARoleAllowed("super_admin", ["stock_officer"]), true);
    assert.equal(isRRARoleAllowed("super_admin", ["compliance_officer"]), true);
});

test("empty allowedRoles list means access is open to any role", () => {
    for (const role of RRA_ROLE_VALUES) {
        assert.ok(isRRARoleAllowed(role as RRARole, []), `Expected any role to pass empty allowedRoles check`);
    }
});

test("direct role match always succeeds regardless of aliases", () => {
    const roles: RRARole[] = ["data_ai_analyst", "payments_reconciliation_officer", "customs_import_officer"];
    for (const role of roles) {
        assert.ok(isRRARoleAllowed(role, [role]));
    }
});

// ---------------------------------------------------------------------------
// Staff account creation schema — only proposed roles accepted
// ---------------------------------------------------------------------------

test("new staff accounts can only be assigned one of the 8 proposed roles", () => {
    for (const role of RRA_ROLE_OPTIONS) {
        assert.ok(
            staffAssignmentRoleSchema.safeParse(role.value).success,
            `Expected proposed role "${role.value}" to be accepted`,
        );
    }
});

test("legacy role names are rejected for new staff account creation", () => {
    const legacy = ["compliance_officer", "audit_officer", "stock_officer", "correction_officer", "reporting_officer"];
    for (const role of legacy) {
        assert.equal(
            staffAssignmentRoleSchema.safeParse(role).success,
            false,
            `Expected legacy role "${role}" to be rejected by staffAssignmentRoleSchema`,
        );
    }
});

test("invalid or fabricated roles are rejected", () => {
    const invalid = ["admin", "rra_admin", "superuser", "", "SUPER_ADMIN", "data-analyst"];
    for (const role of invalid) {
        assert.equal(staffAssignmentRoleSchema.safeParse(role).success, false);
    }
});

// ---------------------------------------------------------------------------
// No permission overlap between unrelated high-risk operations
// ---------------------------------------------------------------------------

test("no role other than super_admin can both manage staff and reconcile payments", () => {
    for (const role of RRA_ROLE_VALUES) {
        if (role === "super_admin") continue;
        const canManageStaff = hasRRAPermission(role as RRARole, "staff.manage");
        const canReconcile = hasRRAPermission(role as RRARole, "payments.reconcile");
        assert.equal(
            canManageStaff && canReconcile,
            false,
            `Role "${role}" should NOT have both staff.manage and payments.reconcile`,
        );
    }
});

test("no role other than super_admin and data_ai_analyst can review AI feedback", () => {
    const permitted = new Set(["super_admin", "data_ai_analyst"]);
    for (const role of RRA_ROLE_VALUES) {
        const has = hasRRAPermission(role as RRARole, "ai.feedback.review");
        if (permitted.has(role)) {
            assert.ok(has, `Expected "${role}" to have ai.feedback.review`);
        } else {
            assert.equal(has, false, `Expected "${role}" NOT to have ai.feedback.review`);
        }
    }
});
test("only super_admin can configure the system", () => {
    for (const role of RRA_ROLE_VALUES) {
        const has = hasRRAPermission(role as RRARole, "system.configure");
        if (role === "super_admin") {
            assert.ok(has);
        } else {
            assert.equal(has, false, `"${role}" should NOT have system.configure`);
        }
    }
});

test("only super_admin can manage staff accounts", () => {
    for (const role of RRA_ROLE_VALUES) {
        const has = hasRRAPermission(role as RRARole, "staff.manage");
        if (role === "super_admin") {
            assert.ok(has);
        } else {
            assert.equal(has, false, `"${role}" should NOT have staff.manage`);
        }
    }
});
