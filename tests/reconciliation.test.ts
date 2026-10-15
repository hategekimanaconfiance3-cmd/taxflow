import test from "node:test";
import assert from "node:assert/strict";
import { calculateStockBalance, detectRelativeDeviation, reconcileSupplyChainPair, type SupplyChainRecord } from "../lib/intelligence/reconciliation";

const dispatch: SupplyChainRecord = {
  transactionId: "dispatch-1", sellerId: "manufacturer-1", buyerId: "wholesaler-1",
  productId: "product-1", quantity: 100, amountRwf: 500000,
};

test("matching dispatch and receipt produce no findings", () => {
  const receipt = { ...dispatch, transactionId: "receipt-1", sellerId: "wholesaler-1", buyerId: "manufacturer-1" };
  assert.deepEqual(reconcileSupplyChainPair(dispatch, receipt), []);
});

test("missing buyer receipt is flagged for review", () => {
  assert.equal(reconcileSupplyChainPair(dispatch, undefined)[0].code, "MISSING_BUYER_MATCH");
});

test("quantity and amount discrepancies are identified", () => {
  const receipt = { ...dispatch, transactionId: "receipt-1", sellerId: "wholesaler-1", buyerId: "manufacturer-1", quantity: 98, amountRwf: 490000 };
  const findings = reconcileSupplyChainPair(dispatch, receipt);
  assert.deepEqual(findings.map((finding) => finding.code), ["QUANTITY_MISMATCH", "AMOUNT_MISMATCH"]);
});

test("identity mismatch prevents misleading comparison", () => {
  const receipt = { ...dispatch, transactionId: "receipt-1", sellerId: "other", buyerId: "manufacturer-1" };
  assert.equal(reconcileSupplyChainPair(dispatch, receipt)[0].code, "IDENTITY_MISMATCH");
});

test("stock movements compute balances and reject overselling", () => {
  assert.equal(calculateStockBalance(10, [
    { quantityDelta: 5, movementType: "production", referenceId: "batch-1" },
    { quantityDelta: -4, movementType: "sale", referenceId: "sale-1" },
  ]), 11);
  assert.throws(() => calculateStockBalance(2, [
    { quantityDelta: -3, movementType: "sale", referenceId: "sale-2" },
  ]), RangeError);
});

test("deviation rule is explainable and does not flag within-threshold values", () => {
  assert.equal(detectRelativeDeviation({ metric: "unit price", observed: 105, expected: 100, relativeThreshold: 0.1 }), null);
  assert.match(detectRelativeDeviation({ metric: "unit price", observed: 150, expected: 100, relativeThreshold: 0.2 })?.message ?? "", /50.0%/);
});
