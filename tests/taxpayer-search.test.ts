/**
 * Tests for the Taxpayer Intelligence Search feature.
 *
 * These tests cover:
 * - Filter validation logic (validateSearchFilters) — pure, no DB/HTTP calls
 * - RBAC: super_admin correctly denied taxpayer.intelligence.search
 * - Filter type contract coverage
 *
 * All tested functions are exported from lib/taxpayer-search-filters.ts,
 * which has zero server/DB dependencies — safe to run without any runtime.
 */

import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { validateSearchFilters, type TaxpayerSearchFilters } from "../lib/taxpayer-search-filters.ts";
import { hasRRAPermission } from "../lib/rra-rbac.ts";

// ---------------------------------------------------------------------------
// validateSearchFilters — date range validation
// ---------------------------------------------------------------------------

describe("validateSearchFilters — date range validation", () => {
    test("returns null when no dates are provided", () => {
        assert.equal(validateSearchFilters({}), null);
    });

    test("returns null when only dateFrom is set and valid", () => {
        assert.equal(validateSearchFilters({ dateFrom: "2026-01-01" }), null);
    });

    test("returns null when only dateTo is set and valid", () => {
        assert.equal(validateSearchFilters({ dateTo: "2026-12-31" }), null);
    });

    test("returns null when dateFrom equals dateTo", () => {
        assert.equal(validateSearchFilters({ dateFrom: "2026-06-15", dateTo: "2026-06-15" }), null);
    });

    test("returns null when dateFrom is before dateTo", () => {
        assert.equal(validateSearchFilters({ dateFrom: "2026-01-01", dateTo: "2026-12-31" }), null);
    });

    test("returns error message when dateTo is before dateFrom", () => {
        const result = validateSearchFilters({ dateFrom: "2026-12-31", dateTo: "2026-01-01" });
        assert.ok(typeof result === "string" && result.length > 0, "Should return a non-empty error message");
        assert.ok(result.toLowerCase().includes("date"), "Error message should mention date");
    });

    test("returns error when dateFrom is invalid", () => {
        const result = validateSearchFilters({ dateFrom: "not-a-date" });
        assert.ok(typeof result === "string" && result.length > 0, "Should return a non-empty error message for invalid dateFrom");
    });

    test("returns error when dateTo is invalid", () => {
        const result = validateSearchFilters({ dateTo: "not-a-date" });
        assert.ok(typeof result === "string" && result.length > 0, "Should return a non-empty error message for invalid dateTo");
    });

    test("returns null for all-empty filter object", () => {
        const empty: TaxpayerSearchFilters = {
            query: "",
            role: "",
            businessType: "",
            clearanceStatus: "",
            dateFrom: "",
            dateTo: "",
        };
        assert.equal(validateSearchFilters(empty), null);
    });

    test("dateFrom after dateTo fails even with other filters set", () => {
        const filters: TaxpayerSearchFilters = {
            query: "acme",
            role: "retailer",
            clearanceStatus: "suspended",
            dateFrom: "2027-01-01",
            dateTo: "2025-01-01",
        };
        const result = validateSearchFilters(filters);
        assert.ok(typeof result === "string" && result.length > 0);
    });

    test("whitespace-only date strings are treated as not set", () => {
        assert.equal(validateSearchFilters({ dateFrom: "   ", dateTo: "   " }), null);
    });
});

// ---------------------------------------------------------------------------
// RBAC — super_admin denied, all operational roles granted
// ---------------------------------------------------------------------------

describe("RBAC — taxpayer.intelligence.search access control", () => {
    test("super_admin is denied taxpayer.intelligence.search", () => {
        assert.equal(
            hasRRAPermission("super_admin", "taxpayer.intelligence.search"),
            false,
            "super_admin must NOT be granted taxpayer.intelligence.search",
        );
    });

    const rolesWithAccess = [
        "tax_compliance_officer",
        "audit_investigation_officer",
        "product_traceability_officer",
        "customs_import_officer",
        "payments_reconciliation_officer",
        "data_ai_analyst",
        "director_executive",
        "compliance_officer",
        "audit_officer",
        "stock_officer",
        "reporting_officer",
    ] as const;

    for (const role of rolesWithAccess) {
        test(`${role} has taxpayer.intelligence.search`, () => {
            assert.ok(
                hasRRAPermission(role, "taxpayer.intelligence.search"),
                `${role} should have taxpayer.intelligence.search`,
            );
        });
    }
});

// ---------------------------------------------------------------------------
// Filter type contract
// ---------------------------------------------------------------------------

describe("TaxpayerSearchFilters type contract", () => {
    test("all supported role values produce no validation error", () => {
        const validRoles: TaxpayerSearchFilters["role"][] = [
            "", "manufacturer", "wholesaler", "retailer",
        ];
        for (const role of validRoles) {
            assert.equal(validateSearchFilters({ role }), null, `role="${role}" should not produce a validation error`);
        }
    });

    test("all supported clearanceStatus values produce no validation error", () => {
        const validStatuses: TaxpayerSearchFilters["clearanceStatus"][] = [
            "", "pending", "approved", "under_review", "suspended",
        ];
        for (const clearanceStatus of validStatuses) {
            assert.equal(validateSearchFilters({ clearanceStatus }), null, `clearanceStatus="${clearanceStatus}" should not produce a validation error`);
        }
    });

    test("all supported businessType values produce no validation error", () => {
        const validTypes: TaxpayerSearchFilters["businessType"][] = [
            "", "registered_business", "institution", "government", "large_bulk_buyer",
        ];
        for (const businessType of validTypes) {
            assert.equal(validateSearchFilters({ businessType }), null, `businessType="${businessType}" should not produce a validation error`);
        }
    });

    test("combined valid filters produce no validation error", () => {
        const filters: TaxpayerSearchFilters = {
            query: "RSSB",
            role: "manufacturer",
            businessType: "institution",
            clearanceStatus: "approved",
            dateFrom: "2025-01-01",
            dateTo: "2026-12-31",
        };
        assert.equal(validateSearchFilters(filters), null);
    });
});
