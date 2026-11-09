import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { calculateSellThrough, type SellThroughCalculationInput } from "../lib/stock-sell-through";
import { hasRRAPermission, RRA_ROLE_PERMISSIONS } from "../lib/rra-rbac";

const at = new Date("2026-11-01T00:00:00Z");
function eligibility(thresholdPercent: number, sold: number) {
  const input: SellThroughCalculationInput = {
    thresholdPercent, evaluatedAt: new Date(at.getTime() + 10_000), baselineQuantity: 100,
    cycleStartedAt: at, baselineStatus: "ledger_verified", currentQuantity: 100 - sold,
    movements: sold ? [{ id: "sale", movementType: "retail_sale", quantityDelta: -sold,
      quantityBefore: 100, quantityAfter: 100 - sold, createdAt: new Date(at.getTime() + 1),
      sourceType: "transaction", sourceId: "sale-1" }] : [], acceptedB2BSales: [],
    hasUnresolvedReservation: false, evidenceComplete: true,
  };
  return calculateSellThrough(input);
}

test("database migration seeds the configurable global threshold at 75 percent", async () => {
  const migration = await readFile(new URL("../db/migrations/taxflow/0031_universal_sell_through_default.sql", import.meta.url), "utf8");
  assert.match(migration, /'default', '\*', 75/);
  assert.match(migration, /ON CONFLICT \(id\) DO NOTHING/);
});

test("75 percent threshold accepts exact and greater sell-through and blocks below", () => {
  assert.equal(eligibility(75, 75).status, "eligible");
  assert.equal(eligibility(75, 74).status, "blocked");
  assert.equal(eligibility(75, 90).status, "eligible");
});

test("effective threshold changes alter eligibility dynamically", () => {
  assert.equal(eligibility(80, 75).status, "blocked");
  assert.equal(eligibility(70, 75).status, "eligible");
});

test("Super Admin and Stock Officer can manage global threshold; traders cannot", () => {
  assert.equal(hasRRAPermission("super_admin", "stock.threshold.manage.global"), true);
  assert.equal(hasRRAPermission("stock_officer", "stock.threshold.manage.global"), true);
  assert.equal(hasRRAPermission("stock_control_admin", "stock.threshold.manage.global"), false);
  for (const role of ["manufacturer", "wholesaler", "retailer"] as const) {
    assert.equal((RRA_ROLE_PERMISSIONS as Record<string, readonly string[]>)[role]?.includes("stock.threshold.manage.global") ?? false, false);
  }
});

test("B2B physical receipt and RRA import receipt gate stock additions in the receipt transaction", async () => {
  const [b2b, imports, helper] = await Promise.all([
    readFile(new URL("../lib/actions/b2b-fulfillment.action.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/actions/import.action.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/stock-sell-through-enforcement.ts", import.meta.url), "utf8"),
  ]);
  const b2bGate = b2b.indexOf("assertPurchasedStockReceiptEligible(tx, txn.buyerId, txn.productId, data.acceptedQuantity");
  const b2bStockWrite = b2b.indexOf("tx.insert(stock).values({", b2bGate);
  assert.ok(b2bGate >= 0 && b2bStockWrite > b2bGate);
  const importGate = imports.indexOf("assertPurchasedStockReceiptEligible(tx, declaration.businessId, declaration.productId, quantityToActivate");
  const importStockWrite = imports.indexOf("tx.insert(stock)", importGate);
  assert.ok(importGate >= 0 && importStockWrite > importGate);
  assert.match(helper, /stockSellThroughCycle\)\.values/);
  assert.match(helper, /\.for\("update"\)/);
  assert.match(helper, /resolveSellThroughThreshold/);
  assert.match(helper, /exceptionStatus, "approved"/);
  assert.match(helper, /STOCK_RESTOCK_EXCEPTION_CONSUMED/);
});

test("threshold revisions are append-only and audit previous value, role, new value, and reason", async () => {
  const [action, schema, migration] = await Promise.all([
    readFile(new URL("../lib/actions/stock-sell-through.action.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/migrations/taxflow/0019_stock_sell_through_requests.sql", import.meta.url), "utf8"),
  ]);
  const start = action.indexOf("export async function createSellThroughThresholdAction");
  const end = action.indexOf("export async function reviewRestockExceptionAction", start);
  const thresholdAction = action.slice(start, end);
  assert.match(thresholdAction, /previousThreshold\.thresholdPercent/);
  assert.match(thresholdAction, /administrativeRole:/);
  assert.match(thresholdAction, /reason: parsed\.data\.reason/);
  assert.match(thresholdAction, /tx\.insert\(stockSellThroughThreshold\)/);
  assert.match(schema, /createdByRole: text\('created_by_role'\)/);
  assert.match(migration, /reject_stock_sell_through_threshold_mutation/);
});
