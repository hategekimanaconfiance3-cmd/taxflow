import test from "node:test";
import assert from "node:assert/strict";
import { calculateVat, sumVatCalculations } from "../lib/intelligence/tax-engine";

test("VAT-exclusive 1,000 RWF at 18% yields 180 VAT and 1,180 gross", () => {
  assert.deepEqual(calculateVat({ amountRwf: 1000, rateBasisPoints: 1800, pricingMode: "exclusive" }), {
    pricingMode: "exclusive", rateBasisPoints: 1800, netAmountRwf: 1000, vatAmountRwf: 180, grossAmountRwf: 1180,
  });
});

test("VAT-inclusive 1,180 RWF at 18% extracts 180 VAT", () => {
  assert.deepEqual(calculateVat({ amountRwf: 1180, rateBasisPoints: 1800, pricingMode: "inclusive" }), {
    pricingMode: "inclusive", rateBasisPoints: 1800, netAmountRwf: 1000, vatAmountRwf: 180, grossAmountRwf: 1180,
  });
});

test("zero rate and zero amount are supported", () => {
  assert.equal(calculateVat({ amountRwf: 1234, rateBasisPoints: 0, pricingMode: "exclusive" }).vatAmountRwf, 0);
  assert.equal(calculateVat({ amountRwf: 0, rateBasisPoints: 1800, pricingMode: "inclusive" }).grossAmountRwf, 0);
});

test("invalid money and rate are rejected", () => {
  assert.throws(() => calculateVat({ amountRwf: -1, rateBasisPoints: 1800, pricingMode: "exclusive" }), RangeError);
  assert.throws(() => calculateVat({ amountRwf: 1.5, rateBasisPoints: 1800, pricingMode: "exclusive" }), RangeError);
  assert.throws(() => calculateVat({ amountRwf: 100, rateBasisPoints: -1, pricingMode: "exclusive" }), RangeError);
});

test("sum totals retains exact whole-RWF amounts", () => {
  const lines = [
    calculateVat({ amountRwf: 1000, rateBasisPoints: 1800, pricingMode: "exclusive" }),
    calculateVat({ amountRwf: 2000, rateBasisPoints: 1800, pricingMode: "exclusive" }),
  ];
  assert.equal(sumVatCalculations(lines).netAmountRwf, 3000);
  assert.equal(sumVatCalculations(lines).vatAmountRwf, 540);
  assert.equal(sumVatCalculations(lines).grossAmountRwf, 3540);
});
