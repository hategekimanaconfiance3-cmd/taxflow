/**
 * Deterministic VAT helpers for TaxFlow.
 *
 * IMPORTANT:
 * - This module is a calculation utility, not a declaration of the legally
 *   applicable tax treatment for every taxpayer or transaction.
 * - Callers must obtain the applicable rate and pricing mode from trusted,
 *   versioned tax configuration and classify the transaction before calculating.
 * - Monetary inputs and outputs are whole RWF. VAT is rounded half-up to the
 *   nearest whole RWF. Confirm this policy with the applicable accounting rules.
 */

export type VatPricingMode = "exclusive" | "inclusive";

export interface VatCalculationInput {
  /** Amount in whole RWF. Exclusive mode: net amount; inclusive mode: gross amount. */
  amountRwf: number;
  /** VAT rate in basis points: 1800 represents 18%. */
  rateBasisPoints: number;
  pricingMode: VatPricingMode;
}

export interface VatCalculation {
  pricingMode: VatPricingMode;
  rateBasisPoints: number;
  netAmountRwf: number;
  vatAmountRwf: number;
  grossAmountRwf: number;
}

function assertSafeWholeRwf(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative safe integer in RWF`);
  }
}

function roundHalfUp(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new RangeError("VAT calculation exceeds safe integer precision");
  }
  return Math.floor(numerator / denominator + 0.5);
}

export function calculateVat(input: VatCalculationInput): VatCalculation {
  assertSafeWholeRwf(input.amountRwf, "amountRwf");
  if (!Number.isSafeInteger(input.rateBasisPoints) || input.rateBasisPoints < 0 || input.rateBasisPoints > 100_000) {
    throw new RangeError("rateBasisPoints must be a safe integer between 0 and 100000");
  }
  if (input.pricingMode !== "inclusive" && input.pricingMode !== "exclusive") {
    throw new TypeError("pricingMode must be 'inclusive' or 'exclusive'");
  }

  const rate = input.rateBasisPoints;
  if (input.pricingMode === "exclusive") {
    const vatAmountRwf = roundHalfUp(input.amountRwf * rate, 10_000);
    const grossAmountRwf = input.amountRwf + vatAmountRwf;
    assertSafeWholeRwf(grossAmountRwf, "grossAmountRwf");
    return {
      pricingMode: input.pricingMode,
      rateBasisPoints: rate,
      netAmountRwf: input.amountRwf,
      vatAmountRwf,
      grossAmountRwf,
    };
  }

  const grossAmountRwf = input.amountRwf;
  const vatAmountRwf = roundHalfUp(grossAmountRwf * rate, 10_000 + rate);
  const netAmountRwf = grossAmountRwf - vatAmountRwf;
  return {
    pricingMode: input.pricingMode,
    rateBasisPoints: rate,
    netAmountRwf,
    vatAmountRwf,
    grossAmountRwf,
  };
}

/** Sum line-level calculations without silently accepting unsafe totals. */
export function sumVatCalculations(lines: readonly VatCalculation[]): VatCalculation {
  if (lines.length === 0) {
    return {
      pricingMode: "exclusive",
      rateBasisPoints: 0,
      netAmountRwf: 0,
      vatAmountRwf: 0,
      grossAmountRwf: 0,
    };
  }

  const netAmountRwf = lines.reduce((sum, line) => sum + line.netAmountRwf, 0);
  const vatAmountRwf = lines.reduce((sum, line) => sum + line.vatAmountRwf, 0);
  const grossAmountRwf = lines.reduce((sum, line) => sum + line.grossAmountRwf, 0);
  assertSafeWholeRwf(netAmountRwf, "netAmountRwf");
  assertSafeWholeRwf(vatAmountRwf, "vatAmountRwf");
  assertSafeWholeRwf(grossAmountRwf, "grossAmountRwf");

  const rates = new Set(lines.map((line) => line.rateBasisPoints));
  const modes = new Set(lines.map((line) => line.pricingMode));
  return {
    pricingMode: modes.size === 1 ? lines[0].pricingMode : "exclusive",
    rateBasisPoints: rates.size === 1 ? lines[0].rateBasisPoints : 0,
    netAmountRwf,
    vatAmountRwf,
    grossAmountRwf,
  };
}
