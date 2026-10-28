export type SellThroughScopeType = "default" | "category" | "product";
export type SellThroughEligibilityStatus = "eligible" | "blocked" | "review_required";

export interface SellThroughThresholdRecord {
  id: string;
  scopeType: SellThroughScopeType;
  scopeKey: string;
  thresholdPercent: number;
  effectiveAt: Date;
  createdAt: Date;
}

export interface SellThroughMovement {
  id: string;
  movementType: string;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  createdAt: Date;
  sourceType: string | null;
  sourceId: string | null;
}

export interface AcceptedB2BSale {
  transactionId: string;
  quantity: number;
  acceptedAt: Date;
  reservedAt: Date | null;
}

export interface SellThroughCalculationInput {
  thresholdPercent: number | null;
  evaluatedAt: Date;
  baselineQuantity: number;
  cycleStartedAt: Date;
  baselineStatus: "needs_review" | "ledger_verified";
  currentQuantity: number | null;
  movements: readonly SellThroughMovement[];
  acceptedB2BSales: readonly AcceptedB2BSale[];
  hasUnresolvedReservation: boolean;
  evidenceComplete: boolean;
}

export interface SellThroughCalculation {
  status: SellThroughEligibilityStatus;
  baselineQuantity: number;
  availableCohortQuantity: number;
  qualifyingSalesQuantity: number;
  requiredSalesQuantity: number;
  remainingSalesQuantity: number;
  sellThroughPercent: number | null;
  reason: string;
}

const EPSILON = 0.000001;
const SALE_MOVEMENTS = new Set(["sale", "retail_sale"]);
const INBOUND_MOVEMENTS = new Set(["production", "import_receipt", "b2b_receipt_accepted"]);

/** Resolve product > category > default, then latest effective record in scope. */
export function resolveSellThroughThreshold<T extends SellThroughThresholdRecord>(
  records: readonly T[],
  productId: string,
  categoryCode: string | null,
  at: Date,
): T | null {
  const precedence: readonly { scopeType: SellThroughScopeType; scopeKey: string; rank: number }[] = [
    { scopeType: "product", scopeKey: productId, rank: 0 },
    ...(categoryCode ? [{ scopeType: "category" as const, scopeKey: categoryCode, rank: 1 }] : []),
    { scopeType: "default", scopeKey: "*", rank: 2 },
  ];

  const matches = records.flatMap((record) => {
    const scope = precedence.find((candidate) => candidate.scopeType === record.scopeType && candidate.scopeKey === record.scopeKey);
    return scope && record.effectiveAt.getTime() <= at.getTime() ? [{ record, rank: scope.rank }] : [];
  });
  matches.sort((left, right) =>
    left.rank - right.rank
    || right.record.effectiveAt.getTime() - left.record.effectiveAt.getTime()
    || right.record.createdAt.getTime() - left.record.createdAt.getTime()
    || right.record.id.localeCompare(left.record.id),
  );
  return matches[0]?.record ?? null;
}

function review(input: SellThroughCalculationInput, reason: string): SellThroughCalculation {
  return {
    status: "review_required",
    baselineQuantity: input.baselineQuantity,
    availableCohortQuantity: input.baselineQuantity,
    qualifyingSalesQuantity: 0,
    requiredSalesQuantity: 0,
    remainingSalesQuantity: 0,
    sellThroughPercent: null,
    reason,
  };
}

/**
 * Calculate eligibility from one prospective aggregate-stock cohort.
 * Only recorded sales reduce sell-through; inbound movements enlarge its
 * denominator. Unsupported movement types, broken ledger chains, and legacy
 * opening balances fail closed to officer review.
 */
export function calculateSellThrough(input: SellThroughCalculationInput): SellThroughCalculation {
  const threshold = input.thresholdPercent;
  if (threshold === null || !Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    return review(input, "No valid active threshold is configured for this product.");
  }
  if (input.baselineStatus !== "ledger_verified") {
    return review(input, "The recorded opening stock has not been attested by an authorized stock officer.");
  }
  if (input.hasUnresolvedReservation) {
    return review(input, "An open reservation lacks completed buyer acceptance; officer review is required.");
  }
  if (!input.evidenceComplete) {
    return review(input, "The evidence window exceeds the automatic analysis limit; officer review is required.");
  }
  if (!Number.isFinite(input.baselineQuantity) || input.baselineQuantity < 0
    || input.currentQuantity === null || !Number.isFinite(input.currentQuantity) || input.currentQuantity < 0) {
    return review(input, "A reliable non-negative current stock balance is unavailable.");
  }

  const cycleStart = input.cycleStartedAt.getTime();
  const evaluatedAt = input.evaluatedAt.getTime();
  if (!Number.isFinite(cycleStart) || !Number.isFinite(evaluatedAt) || input.movements.some((movement) => !Number.isFinite(movement.createdAt.getTime()))) {
    return review(input, "A stock movement or cohort has an invalid recorded timestamp.");
  }
  const movements = input.movements
    .filter((movement) => movement.createdAt.getTime() >= cycleStart)
    .slice()
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id));

  let expectedBefore = input.baselineQuantity;
  let availableCohortQuantity = input.baselineQuantity;
  let qualifyingSalesQuantity = 0;
  let reviewReason: string | null = null;
  const countedSaleSources = new Set<string>();

  for (const movement of movements) {
    if (![movement.quantityDelta, movement.quantityBefore, movement.quantityAfter].every(Number.isFinite)) {
      reviewReason ??= "A stock movement contains an invalid quantity.";
      continue;
    }
    if (Math.abs(movement.quantityBefore - expectedBefore) > EPSILON
      || Math.abs(movement.quantityAfter - movement.quantityBefore - movement.quantityDelta) > EPSILON) {
      reviewReason ??= "The stock movement ledger does not reconcile with the recorded cohort.";
    }
    expectedBefore = movement.quantityAfter;

    if (SALE_MOVEMENTS.has(movement.movementType)) {
      if (movement.quantityDelta >= 0 || movement.sourceType !== "transaction" || !movement.sourceId) {
        reviewReason ??= "A sale movement is missing reliable transaction provenance.";
        continue;
      }
      if (countedSaleSources.has(movement.sourceId)) {
        reviewReason ??= "Duplicate sale movement provenance was found.";
        continue;
      }
      countedSaleSources.add(movement.sourceId);
      qualifyingSalesQuantity += Math.abs(movement.quantityDelta);
      if (!Number.isFinite(qualifyingSalesQuantity)) reviewReason ??= "Recorded sales exceed the supported calculation range.";
      continue;
    }

    if (INBOUND_MOVEMENTS.has(movement.movementType)) {
      if (movement.quantityDelta <= 0 || !movement.sourceType || !movement.sourceId) {
        reviewReason ??= "An inbound stock movement is missing reliable source evidence.";
        continue;
      }
      availableCohortQuantity += movement.quantityDelta;
      if (!Number.isFinite(availableCohortQuantity)) reviewReason ??= "The stock cohort exceeds the supported calculation range.";
      continue;
    }

    if (movement.movementType === "sale_reservation" || movement.movementType === "sale_reservation_released") {
      const expectedSign = movement.movementType === "sale_reservation" ? -1 : 1;
      if (Math.sign(movement.quantityDelta) !== expectedSign || movement.sourceType !== "stock_reservation" || !movement.sourceId) {
        reviewReason ??= "A stock reservation movement is missing reliable reservation provenance.";
      }
      // Reservation holds change seller available stock but are not sales.
      // Buyer acceptance is counted separately from its explicit evidence.
      continue;
    }

    reviewReason ??= `Movement type '${movement.movementType}' is not included in the sell-through calculation.`;
  }

  for (const sale of input.acceptedB2BSales) {
    const acceptedAt = sale.acceptedAt.getTime();
    if (!Number.isFinite(acceptedAt) || !sale.transactionId || !Number.isFinite(sale.quantity) || sale.quantity <= 0) {
      reviewReason ??= "A buyer-accepted B2B transaction has invalid sale evidence.";
      continue;
    }
    if (acceptedAt < cycleStart || acceptedAt > evaluatedAt) {
      continue;
    }
    if (sale.reservedAt && sale.reservedAt.getTime() < cycleStart) continue;
    if (countedSaleSources.has(sale.transactionId)) continue;
    countedSaleSources.add(sale.transactionId);
    qualifyingSalesQuantity += sale.quantity;
    if (!Number.isFinite(qualifyingSalesQuantity)) reviewReason ??= "Recorded sales exceed the supported calculation range.";
  }

  if (Math.abs(expectedBefore - input.currentQuantity) > EPSILON) {
    reviewReason ??= "The movement ledger does not reconcile with current available stock.";
  }
  if (qualifyingSalesQuantity - availableCohortQuantity > EPSILON) {
    reviewReason ??= "Recorded sales exceed the stock quantity available in this cohort.";
  }
  if (reviewReason) return review(input, reviewReason);

  const requiredSalesQuantity = availableCohortQuantity * threshold / 100;
  if (!Number.isFinite(requiredSalesQuantity)) return review(input, "The sell-through requirement exceeds the supported calculation range.");
  const remainingSalesQuantity = Math.max(0, requiredSalesQuantity - qualifyingSalesQuantity);
  const sellThroughPercent = availableCohortQuantity > EPSILON
    ? (qualifyingSalesQuantity / availableCohortQuantity) * 100
    : null;
  const status: SellThroughEligibilityStatus = remainingSalesQuantity <= EPSILON ? "eligible" : "blocked";
  const reason = availableCohortQuantity <= EPSILON
    ? "No prior recorded stock cohort exists; this initial restock request has no sales requirement."
    : status === "eligible"
      ? `Recorded sales meet the ${threshold}% threshold for this stock cohort.`
      : `Recorded sales are short of the ${threshold}% threshold by ${remainingSalesQuantity} units.`;

  return {
    status,
    baselineQuantity: input.baselineQuantity,
    availableCohortQuantity,
    qualifyingSalesQuantity,
    requiredSalesQuantity,
    remainingSalesQuantity,
    sellThroughPercent,
    reason,
  };
}
