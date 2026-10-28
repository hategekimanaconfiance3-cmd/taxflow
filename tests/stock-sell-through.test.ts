import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateSellThrough,
  resolveSellThroughThreshold,
  type SellThroughCalculationInput,
  type SellThroughMovement,
  type SellThroughThresholdRecord,
} from "../lib/stock-sell-through";

const at = new Date("2026-10-01T00:00:00.000Z");

function movement(
  id: string,
  movementType: string,
  quantityDelta: number,
  quantityBefore: number,
  sourceId = id,
): SellThroughMovement {
  return {
    id,
    movementType,
    quantityDelta,
    quantityBefore,
    quantityAfter: quantityBefore + quantityDelta,
    createdAt: new Date(at.getTime() + Number(id.replace(/\D/g, "") || "1")),
    sourceType: movementType === "sale" || movementType === "retail_sale" ? "transaction"
      : movementType === "sale_reservation" || movementType === "sale_reservation_released" ? "stock_reservation"
        : "stock_source",
    sourceId,
  };
}

function input(overrides: Partial<SellThroughCalculationInput> = {}): SellThroughCalculationInput {
  return {
    thresholdPercent: 75,
    evaluatedAt: new Date(at.getTime() + 100_000),
    baselineQuantity: 100,
    cycleStartedAt: at,
    baselineStatus: "ledger_verified",
    currentQuantity: 100,
    movements: [],
    acceptedB2BSales: [],
    hasUnresolvedReservation: false,
    evidenceComplete: true,
    ...overrides,
  };
}

test("threshold precedence is product, category, then default and respects effective dates", () => {
  const records: SellThroughThresholdRecord[] = [
    { id: "default", scopeType: "default", scopeKey: "*", thresholdPercent: 50, effectiveAt: at, createdAt: at },
    { id: "category", scopeType: "category", scopeKey: "cement", thresholdPercent: 60, effectiveAt: at, createdAt: at },
    { id: "product", scopeType: "product", scopeKey: "cement-1", thresholdPercent: 70, effectiveAt: at, createdAt: at },
    { id: "future", scopeType: "product", scopeKey: "cement-1", thresholdPercent: 80, effectiveAt: new Date(at.getTime() + 60_000), createdAt: at },
  ];

  assert.equal(resolveSellThroughThreshold(records, "cement-1", "cement", at)?.thresholdPercent, 70);
  assert.equal(resolveSellThroughThreshold(records.slice(0, 2), "cement-1", "cement", at)?.thresholdPercent, 60);
  assert.equal(resolveSellThroughThreshold(records.slice(0, 1), "cement-1", null, at)?.thresholdPercent, 50);
  assert.equal(resolveSellThroughThreshold([], "cement-1", null, at), null);
});

test("evidence windows above the bound require review instead of using a truncated subtotal", () => {
  assert.equal(calculateSellThrough(input({ evidenceComplete: false })).status, "review_required");
});

test("zero percent is eligible without sales and 75/100 percent thresholds use recorded sales", () => {
  assert.equal(calculateSellThrough(input({ thresholdPercent: 0 })).status, "eligible");

  const sales75 = [movement("sale-1", "retail_sale", -75, 100)];
  assert.equal(calculateSellThrough(input({ currentQuantity: 25, movements: sales75 })).status, "eligible");

  const sales74 = [movement("sale-1", "retail_sale", -74, 100)];
  const blocked = calculateSellThrough(input({ currentQuantity: 26, movements: sales74 }));
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.remainingSalesQuantity, 1);

  const exact100 = [movement("sale-1", "sale", -100, 100)];
  assert.equal(calculateSellThrough(input({ thresholdPercent: 100, currentQuantity: 0, movements: exact100 })).status, "eligible");
  assert.equal(calculateSellThrough(input({ thresholdPercent: 100 })).status, "blocked");
});

test("verified inbound stock increases the cohort denominator before sell-through is compared", () => {
  const movements = [
    movement("1", "import_receipt", 20, 100, "import-1"),
    movement("2", "retail_sale", -90, 120, "sale-1"),
  ];
  const result = calculateSellThrough(input({ currentQuantity: 30, movements }));
  assert.equal(result.availableCohortQuantity, 120);
  assert.equal(result.qualifyingSalesQuantity, 90);
  assert.equal(result.sellThroughPercent, 75);
  assert.equal(result.status, "eligible");
});

test("legacy baselines, reservations, broken ledgers, duplicate sales, and non-sale reductions require review", () => {
  assert.equal(calculateSellThrough(input({ baselineStatus: "needs_review" })).status, "review_required");
  assert.equal(calculateSellThrough(input({ hasUnresolvedReservation: true })).status, "review_required");

  const duplicateSales = [
    movement("1", "sale", -10, 100, "same-transaction"),
    movement("2", "retail_sale", -10, 90, "same-transaction"),
  ];
  assert.equal(calculateSellThrough(input({ currentQuantity: 80, movements: duplicateSales })).status, "review_required");

  const lostStock = [movement("1", "correction", -10, 100, "correction-1")];
  assert.equal(calculateSellThrough(input({ currentQuantity: 90, movements: lostStock })).status, "review_required");

  const brokenChain = [movement("1", "retail_sale", -10, 99, "sale-1")];
  assert.equal(calculateSellThrough(input({ currentQuantity: 89, movements: brokenChain })).status, "review_required");
});

test("returns, losses, transfers, reversals, and corrections are not treated as sell-through sales", () => {
  for (const movementType of ["return", "stock_loss", "transfer_out", "reversal", "correction_void"]) {
    const event = movement("1", movementType, -10, 100, `${movementType}-1`);
    const result = calculateSellThrough(input({ currentQuantity: 90, movements: [event] }));
    assert.equal(result.status, "review_required", `${movementType} must require officer review`);
    assert.match(result.reason, /not included in the sell-through calculation/i);
  }
});

test("buyer-accepted B2B orders count once while reservation holds are not sales", () => {
  const movements = [movement("1", "sale_reservation", -20, 100, "reservation-1")];
  const acceptedB2BSales = [{ transactionId: "txn-1", quantity: 20, acceptedAt: new Date(at.getTime() + 10_000), reservedAt: new Date(at.getTime() + 5_000) }];
  const result = calculateSellThrough(input({ currentQuantity: 80, movements, acceptedB2BSales }));
  assert.equal(result.qualifyingSalesQuantity, 20);
  assert.equal(result.status, "blocked");

  const duplicate = [movement("1", "sale", -20, 100, "txn-1")];
  const deduplicated = calculateSellThrough(input({ currentQuantity: 80, movements: duplicate, acceptedB2BSales }));
  assert.equal(deduplicated.qualifyingSalesQuantity, 20);
});

test("a B2B reservation created before the cohort is not counted as a cohort sale", () => {
  const acceptedB2BSales = [{
    transactionId: "txn-before-cycle",
    quantity: 20,
    acceptedAt: new Date(at.getTime() + 10_000),
    reservedAt: new Date(at.getTime() - 5_000),
  }];
  const result = calculateSellThrough(input({ acceptedB2BSales }));
  assert.equal(result.qualifyingSalesQuantity, 0);
  assert.equal(result.status, "blocked");
});

test("an empty stock cohort supports an initial request without inventing a sell-through percentage", () => {
  const result = calculateSellThrough(input({ baselineQuantity: 0, currentQuantity: 0, thresholdPercent: 100 }));
  assert.equal(result.status, "eligible");
  assert.equal(result.sellThroughPercent, null);
  assert.equal(result.requiredSalesQuantity, 0);
});
