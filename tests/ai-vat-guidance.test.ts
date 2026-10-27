import assert from "node:assert/strict";
import { test } from "node:test";
import { buildVatGuidance } from "../lib/ai/vat-guidance";

test("VAT assistant guidance reflects configured rates without asserting law", () => {
  const guidance = buildVatGuidance(0.18);
  assert.match(guidance.configuredVatRatePercent, /18/);
  assert.match(guidance.rateSource, /TaxFlow system configuration/);
  assert.match(guidance.legalGuidance, /filing deadlines are not available/);
  assert.doesNotMatch(guidance.legalGuidance, /15th/);
});

test("VAT assistant guidance follows configuration changes", () => {
  assert.match(buildVatGuidance(0.05).configuredVatRatePercent, /5/);
});

test("invalid stored VAT configuration is rejected", () => {
  assert.throws(() => buildVatGuidance(Number.NaN), RangeError);
  assert.throws(() => buildVatGuidance(1.01), RangeError);
});
