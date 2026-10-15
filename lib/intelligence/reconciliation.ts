/**
 * Explainable, deterministic reconciliation helpers.
 * These helpers flag discrepancies for review; they do not determine fraud or
 * create an official tax assessment.
 */

export interface SupplyChainRecord {
  transactionId: string;
  sellerId: string;
  buyerId: string;
  productId: string;
  quantity: number;
  amountRwf: number;
}

export interface ReconciliationFinding {
  code: "MISSING_BUYER_MATCH" | "QUANTITY_MISMATCH" | "AMOUNT_MISMATCH" | "IDENTITY_MISMATCH";
  severity: "low" | "medium" | "high";
  message: string;
  sellerTransactionId: string;
  buyerTransactionId?: string;
  expected?: number;
  observed?: number;
}

export interface ReconciliationTolerance {
  quantityAbsolute: number;
  amountRwfAbsolute: number;
}

/**
 * Match a seller's dispatch with the buyer's receipt using explicit references.
 * Do not fuzzy-match identity in a way that silently treats records as equal.
 */
export function reconcileSupplyChainPair(
  dispatch: SupplyChainRecord,
  receipt: SupplyChainRecord | undefined,
  tolerance: ReconciliationTolerance = { quantityAbsolute: 0, amountRwfAbsolute: 0 },
): ReconciliationFinding[] {
  if (!Number.isFinite(tolerance.quantityAbsolute) || tolerance.quantityAbsolute < 0 ||
      !Number.isSafeInteger(tolerance.amountRwfAbsolute) || tolerance.amountRwfAbsolute < 0) {
    throw new RangeError("Reconciliation tolerances must be non-negative");
  }

  if (!receipt) {
    return [{
      code: "MISSING_BUYER_MATCH",
      severity: "high",
      message: "No buyer receipt was matched to this seller dispatch.",
      sellerTransactionId: dispatch.transactionId,
    }];
  }

  const findings: ReconciliationFinding[] = [];
  if (dispatch.sellerId !== receipt.buyerId || dispatch.buyerId !== receipt.sellerId ||
      dispatch.productId !== receipt.productId) {
    findings.push({
      code: "IDENTITY_MISMATCH",
      severity: "high",
      message: "Seller, buyer, or product identifiers do not agree across the two records.",
      sellerTransactionId: dispatch.transactionId,
      buyerTransactionId: receipt.transactionId,
    });
    return findings;
  }

  if (Math.abs(dispatch.quantity - receipt.quantity) > tolerance.quantityAbsolute) {
    findings.push({
      code: "QUANTITY_MISMATCH",
      severity: "medium",
      message: "Dispatched quantity differs from the buyer's recorded receipt.",
      sellerTransactionId: dispatch.transactionId,
      buyerTransactionId: receipt.transactionId,
      expected: dispatch.quantity,
      observed: receipt.quantity,
    });
  }

  if (Math.abs(dispatch.amountRwf - receipt.amountRwf) > tolerance.amountRwfAbsolute) {
    findings.push({
      code: "AMOUNT_MISMATCH",
      severity: "medium",
      message: "Invoice amount differs between seller and buyer records.",
      sellerTransactionId: dispatch.transactionId,
      buyerTransactionId: receipt.transactionId,
      expected: dispatch.amountRwf,
      observed: receipt.amountRwf,
    });
  }

  return findings;
}

export interface StockMovement {
  quantityDelta: number;
  movementType: "opening" | "production" | "purchase" | "sale" | "return" | "loss" | "adjustment";
  referenceId: string;
}

export function calculateStockBalance(openingQuantity: number, movements: readonly StockMovement[]): number {
  if (!Number.isFinite(openingQuantity) || openingQuantity < 0) {
    throw new RangeError("openingQuantity must be finite and non-negative");
  }
  let balance = openingQuantity;
  for (const movement of movements) {
    if (!Number.isFinite(movement.quantityDelta) || !movement.referenceId.trim()) {
      throw new TypeError("Every stock movement needs a finite quantityDelta and a referenceId");
    }
    balance += movement.quantityDelta;
    if (balance < -1e-9) {
      throw new RangeError(`Stock balance cannot become negative after movement ${movement.referenceId}`);
    }
  }
  return Math.max(0, balance);
}

export interface RiskObservation {
  metric: string;
  observed: number;
  expected: number;
  /** Relative deviation threshold; e.g. 0.25 means 25%. */
  relativeThreshold: number;
}

/** Simple explainable anomaly rule; output is a review flag, never a fraud verdict. */
export function detectRelativeDeviation(observation: RiskObservation): ReconciliationFinding | null {
  const values = [observation.observed, observation.expected, observation.relativeThreshold];
  if (values.some((value) => !Number.isFinite(value)) || observation.expected < 0 ||
      observation.observed < 0 || observation.relativeThreshold < 0) {
    throw new RangeError("Risk observations and thresholds must be finite and non-negative");
  }
  if (observation.expected === 0) {
    return observation.observed === 0 ? null : {
      code: "AMOUNT_MISMATCH",
      severity: "high",
      message: `${observation.metric} is non-zero when the expected baseline is zero; review required.`,
      sellerTransactionId: "risk-observation",
      expected: 0,
      observed: observation.observed,
    };
  }
  const deviation = Math.abs(observation.observed - observation.expected) / observation.expected;
  if (deviation <= observation.relativeThreshold) return null;
  return {
    code: "AMOUNT_MISMATCH",
    severity: deviation >= observation.relativeThreshold * 2 ? "high" : "medium",
    message: `${observation.metric} differs from its baseline by ${(deviation * 100).toFixed(1)}%; review the evidence.`,
    sellerTransactionId: "risk-observation",
    expected: observation.expected,
    observed: observation.observed,
  };
}
