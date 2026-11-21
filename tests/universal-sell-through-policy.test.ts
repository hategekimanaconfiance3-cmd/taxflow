import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { calculateSellThrough, type SellThroughCalculationInput } from "../lib/stock-sell-through";
import { MANDATORY_SELL_THROUGH_THRESHOLD_PERCENT, SYSTEM_DEFAULT_SELL_THROUGH_THRESHOLD_ID, validateSystemSellThroughPolicy } from "../lib/stock-sell-through-policy";
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

test("decimal B2B sell-through remains blocked below the exact 75 percent boundary", () => {
  const belowBoundary = eligibility(75, 74.99);
  assert.equal(belowBoundary.status, "blocked");
  assert.ok(Math.abs(belowBoundary.remainingSalesQuantity - 0.01) < 0.000001);
});

test("effective threshold changes alter eligibility dynamically", () => {
  assert.equal(eligibility(80, 75).status, "blocked");
  assert.equal(eligibility(70, 75).status, "eligible");
});

test("only Super Admin can manage the global threshold; stock officers can monitor it", () => {
  assert.equal(hasRRAPermission("super_admin", "stock.threshold.manage.global"), true);
  assert.equal(hasRRAPermission("stock_officer", "stock.threshold.read"), true);
  assert.equal(hasRRAPermission("stock_officer", "stock.threshold.manage.global"), false);
  assert.equal(hasRRAPermission("stock_control_admin", "stock.threshold.manage.global"), false);
  for (const role of ["manufacturer", "wholesaler", "retailer"] as const) {
    assert.equal((RRA_ROLE_PERMISSIONS as Record<string, readonly string[]>)[role]?.includes("stock.threshold.manage.global") ?? false, false);
  }
});

test("B2B physical receipt and RRA import receipt gate stock additions in the receipt transaction", async () => {
  const [b2b, transaction, imports, helper, action, page] = await Promise.all([
    readFile(new URL("../lib/actions/b2b-fulfillment.action.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/actions/transaction.action.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/actions/import.action.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/stock-sell-through-enforcement.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/actions/stock-sell-through.action.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/(admin)/admin/stock-control/page.tsx", import.meta.url), "utf8"),
  ]);
  const b2bGate = b2b.indexOf("assertPurchasedStockReceiptEligible(tx, txn.buyerId, txn.productId, data.acceptedQuantity");
  const b2bStockWrite = b2b.indexOf("tx.insert(stock).values({", b2bGate);
  assert.ok(b2bGate >= 0 && b2bStockWrite > b2bGate);
  const importGate = imports.indexOf("assertPurchasedStockReceiptEligible(tx, declaration.businessId, declaration.productId, quantityToActivate");
  const importStockWrite = imports.indexOf("tx.insert(stock)", importGate);
  assert.ok(importGate >= 0 && importStockWrite > importGate);
  assert.match(helper, /stockSellThroughCycle\)\.values/);
  assert.match(helper, /\.for\("update"\)/);
  assert.match(helper, /resolveSystemSellThroughPolicy/);
  assert.doesNotMatch(helper, /resolveSellThroughThreshold/);
  assert.match(helper, /receiptBlocked \? db : tx/);
  assert.match(helper, /STOCK_PURCHASED_RECEIPT_ELIGIBILITY_EVALUATED/);
  assert.match(helper, /exceptionStatus, "approved"/);
  assert.match(helper, /STOCK_RESTOCK_EXCEPTION_CONSUMED/);
  const confirmation = transaction.slice(transaction.indexOf("export async function confirmTransaction("), transaction.indexOf("// Reject Transaction (Buyer rejects)"));
  assert.doesNotMatch(confirmation, /movementType: 'b2b_purchase_confirmed'/);
  assert.match(confirmation, /receiptRequiredForBuyerStockCredit: true/);
  assert.doesNotMatch(action, /ne\(stockSellThroughThreshold\.id/);
  assert.doesNotMatch(helper, /ne\(stockSellThroughThreshold\.id/);
  assert.doesNotMatch(page, /system default.*inactive/i);
});

test("the migration-seeded default is automatically valid while missing or weakened policy fails closed", async () => {
  const base = {
    id: SYSTEM_DEFAULT_SELL_THROUGH_THRESHOLD_ID,
    scopeType: "default" as const,
    scopeKey: "*",
    thresholdPercent: MANDATORY_SELL_THROUGH_THRESHOLD_PERCENT,
    effectiveAt: at,
    createdAt: at,
    reason: "Initial TaxFlow global sell-through policy default: 75%.",
    createdByUserId: null,
    createdByRole: null,
  };
  assert.equal(validateSystemSellThroughPolicy(base, new Date(at.getTime() + 1)).policy?.thresholdPercent, 75);
  assert.equal(validateSystemSellThroughPolicy(null, at).policy, null);
  assert.match(validateSystemSellThroughPolicy(null, at).integrityFailureReason ?? "", /missing/i);
  assert.equal(validateSystemSellThroughPolicy({ ...base, thresholdPercent: 74.99 }, at).policy, null);
  assert.equal(validateSystemSellThroughPolicy({ ...base, id: "authorized-stricter-policy", thresholdPercent: 80, createdByUserId: "admin", createdByRole: "super_admin" }, at).policy?.thresholdPercent, 80);
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
