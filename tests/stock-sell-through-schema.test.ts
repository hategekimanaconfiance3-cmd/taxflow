import assert from "node:assert/strict";
import { test } from "node:test";
import {
  stockRestockRequestSchema,
  stockSellThroughThresholdSchema,
} from "../lib/validation/stock-sell-through.schema";

test("threshold validation accepts 0 and 100 percent and rejects values outside the policy range", () => {
  const base = { scopeType: "default", scopeKey: "*", effectiveAt: "2027-01-01T00:00", reason: "Approved policy revision" };
  assert.equal(stockSellThroughThresholdSchema.safeParse({ ...base, thresholdPercent: "0" }).success, true);
  assert.equal(stockSellThroughThresholdSchema.safeParse({ ...base, thresholdPercent: "100" }).success, true);
  assert.equal(stockSellThroughThresholdSchema.safeParse({ ...base, thresholdPercent: "100.01" }).success, false);
  assert.equal(stockSellThroughThresholdSchema.safeParse({ ...base, thresholdPercent: "-1" }).success, false);
  assert.equal(stockSellThroughThresholdSchema.safeParse({ ...base, thresholdPercent: "not-a-number" }).success, false);
});

test("restock request validation requires a positive bounded quantity and a reason for exceptions", () => {
  const base = { productId: "product-1", requestedQuantity: "3.5", idempotencyKey: "3a7dba1c-11f0-47e3-9b5a-01b04f3a7d8e" };
  assert.equal(stockRestockRequestSchema.safeParse(base).success, true);
  assert.equal(stockRestockRequestSchema.safeParse({ ...base, requestedQuantity: "0" }).success, false);
  assert.equal(stockRestockRequestSchema.safeParse({ ...base, requestedQuantity: "1000000001" }).success, false);
  assert.equal(stockRestockRequestSchema.safeParse({ ...base, exceptionReason: "short" }).success, false);
  assert.equal(stockRestockRequestSchema.safeParse({ ...base, exceptionReason: "Urgent demand with documented customer orders." }).success, true);
});
