import test from "node:test";
import assert from "node:assert/strict";
import { reconcileStockMovements } from "../lib/product-journey/reconciliation";

test("accepts a movement whose before + delta equals after", () => {
  const [result] = reconcileStockMovements([
    { id: "m1", quantityBefore: 100, quantityDelta: -25, quantityAfter: 75 },
  ]);
  assert.equal(result.consistent, true);
  assert.equal(result.difference, 0);
});

test("flags arithmetic mismatch without calling it fraud", () => {
  const [result] = reconcileStockMovements([
    { id: "m2", quantityBefore: 100, quantityDelta: -25, quantityAfter: 80 },
  ]);
  assert.equal(result.consistent, false);
  assert.equal(result.expectedAfter, 75);
  assert.equal(result.difference, 5);
});

test("tolerates floating point noise", () => {
  const [result] = reconcileStockMovements([
    { id: "m3", quantityBefore: 0.1, quantityDelta: 0.2, quantityAfter: 0.30000000001 },
  ]);
  assert.equal(result.consistent, true);
});

test("marks non-finite arithmetic as inconsistent", () => {
  const [result] = reconcileStockMovements([
    { id: "m4", quantityBefore: Number.NaN, quantityDelta: 1, quantityAfter: 1 },
  ]);
  assert.equal(result.consistent, false);
});
