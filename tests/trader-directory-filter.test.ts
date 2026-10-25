import assert from "node:assert/strict";
import { test } from "node:test";
import { traderDirectoryFilterSchema } from "../lib/validation/trader-filter.schema";

test("trader directory accepts existing business and clearance status filters", () => {
  const parsed = traderDirectoryFilterSchema.safeParse({
    businessRole: "retailer",
    accountStatus: "active",
    clearanceStatus: "approved",
    registeredFrom: "2026-01-01",
    registeredTo: "2026-10-25",
    page: 1,
  });
  assert.equal(parsed.success, true);
});

test("location filters require the existing province-to-village hierarchy", () => {
  assert.equal(traderDirectoryFilterSchema.safeParse({ sector: "Kimihurura" }).success, false);
  assert.equal(traderDirectoryFilterSchema.safeParse({ province: "Kigali", district: "Gasabo", sector: "Kimihurura" }).success, true);
});

test("date ranges reject reversed bounds and non-existing legal statuses", () => {
  assert.equal(traderDirectoryFilterSchema.safeParse({ registeredFrom: "2026-10-25", registeredTo: "2026-01-01" }).success, false);
  assert.equal(traderDirectoryFilterSchema.safeParse({ clearanceStatus: "compliant" }).success, false);
  assert.equal(traderDirectoryFilterSchema.safeParse({ registeredFrom: "2026-02-30" }).success, false);
  assert.equal(traderDirectoryFilterSchema.safeParse({ activityFrom: "2026-10-25", activityTo: "2026-10-25", activityFromTime: "12:00", activityToTime: "08:00" }).success, false);
});

test("transaction and stock thresholds accept combined ranges and reject inverted bounds", () => {
  assert.equal(traderDirectoryFilterSchema.safeParse({ minSalesVolume: 0, maxSalesVolume: 1000, minStockQuantity: 0, maxStockQuantity: 20, product: "Cement" }).success, true);
  assert.equal(traderDirectoryFilterSchema.safeParse({ minTransactions: 10, maxTransactions: 2 }).success, false);
  assert.equal(traderDirectoryFilterSchema.safeParse({ minStockQuantity: 0 }).success, false);
});

test("pagination and search input are bounded on the server", () => {
  assert.equal(traderDirectoryFilterSchema.safeParse({ query: "x".repeat(121) }).success, false);
  assert.equal(traderDirectoryFilterSchema.safeParse({ page: 10001 }).success, false);
});
