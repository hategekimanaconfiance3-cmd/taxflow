import assert from "node:assert/strict";
import { test } from "node:test";
import { canReadTaxpayerSearchContact, projectTaxpayerSearchRow } from "../lib/taxpayer-search-policy";
import { hasRRAPermission } from "../lib/rra-rbac";

const searchRow = {
  id: "trader-1",
  name: "Trader",
  businessName: "Trader Limited",
  tinNumber: "TIN-1",
  role: "retailer",
  clearanceStatus: "approved",
  email: "private@example.test",
  phoneNumber: "+250700000000",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

test("taxpayer search omits email and phone for Correction Officers", () => {
  assert.equal(canReadTaxpayerSearchContact(["correction_officer"]), false);
  const result = projectTaxpayerSearchRow(searchRow, ["correction_officer"]);
  assert.equal("email" in result, false);
  assert.equal("phoneNumber" in result, false);
  assert.deepEqual(result, {
    id: "trader-1",
    name: "Trader",
    businessName: "Trader Limited",
    tinNumber: "TIN-1",
    role: "retailer",
    clearanceStatus: "approved",
    createdAt: searchRow.createdAt,
  });
});

test("taxpayer search contact access follows the existing compliance permission", () => {
  for (const role of ["correction_officer", "stock_officer", "product_traceability_officer"] as const) {
    assert.equal(canReadTaxpayerSearchContact([role]), hasRRAPermission(role, "taxpayer.compliance.read"));
  }

  assert.equal(canReadTaxpayerSearchContact(["compliance_officer"]), true);
  assert.deepEqual(
    projectTaxpayerSearchRow(searchRow, ["compliance_officer"]),
    searchRow,
  );
});

test("multiple assigned roles grant contact fields only when one has the explicit permission", () => {
  assert.equal(canReadTaxpayerSearchContact(["correction_officer", "tax_compliance_officer"]), true);
  assert.equal(canReadTaxpayerSearchContact(["correction_officer", "stock_officer"]), false);
});
