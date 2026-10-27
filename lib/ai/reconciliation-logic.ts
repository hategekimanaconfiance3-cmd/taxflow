// ---------------------------------------------------------------------------
// TaxFlow — Reconciliation Pure Logic Functions
// These are deterministic, DB-free calculations that can be unit-tested.
// The reconciliation service imports these; tests import them directly.
// Spec §3, §5, §12 Stage 1
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Inventory Reconciliation (§3.1, §5.2)
// ---------------------------------------------------------------------------

export interface ReconciliationInputs {
  openingStock: number;
  received: number;    // confirmed purchases/receipts
  produced: number;    // declared production
  sold: number;        // confirmed/completed sales
  losses: number;      // approved damage/loss adjustments
}

export interface ReconciliationResult {
  expectedClosing: number;
  discrepancy: number;      // expectedClosing - recordedClosing
  discrepancyPct: number;   // as % of expectedClosing (abs)
  hasDiscrepancy: boolean;  // |discrepancyPct| > threshold
  direction: 'surplus' | 'deficit' | 'balanced';
}

export function calculateExpectedClosing(inputs: ReconciliationInputs): number {
  return inputs.openingStock + inputs.received + inputs.produced - inputs.sold - inputs.losses;
}

export function calculateDiscrepancy(
  expectedClosing: number,
  recordedClosing: number,
  thresholdPct = 5,
): ReconciliationResult {
  const discrepancy = expectedClosing - recordedClosing;
  const discrepancyPct =
    expectedClosing !== 0
      ? Math.abs((discrepancy / expectedClosing) * 100)
      : Math.abs(discrepancy) > 0 ? 100 : 0;

  const hasDiscrepancy = discrepancyPct > thresholdPct || Math.abs(discrepancy) > 1;
  const direction: ReconciliationResult['direction'] =
    discrepancy > 0.5 ? 'surplus' : discrepancy < -0.5 ? 'deficit' : 'balanced';

  return {
    expectedClosing,
    discrepancy,
    discrepancyPct: Math.round(discrepancyPct * 10) / 10,
    hasDiscrepancy,
    direction,
  };
}

// ---------------------------------------------------------------------------
// Dispatch / Receipt Mismatch (§3.2)
// ---------------------------------------------------------------------------

export interface DispatchReceiptResult {
  dispatched: number;
  confirmed: number;
  difference: number;
  differencePct: number;
  hasMismatch: boolean;
  possibleReasons: string[];
}

export function calculateDispatchMismatch(
  dispatched: number,
  confirmed: number,
  thresholdPct = 2,
): DispatchReceiptResult {
  const difference = dispatched - confirmed;
  const differencePct = dispatched > 0 ? Math.abs((difference / dispatched) * 100) : 0;
  const hasMismatch = differencePct > thresholdPct && Math.abs(difference) >= 1;

  const possibleReasons: string[] = [];
  if (hasMismatch) {
    if (difference > 0) possibleReasons.push('Partial delivery', 'In-transit loss', 'Incomplete receipt confirmation', 'Duplicate dispatch entry');
    if (difference < 0) possibleReasons.push('Over-receipt recorded', 'Data entry error', 'Return goods included');
  }

  return { dispatched, confirmed, difference, differencePct: Math.round(differencePct * 10) / 10, hasMismatch, possibleReasons };
}

// ---------------------------------------------------------------------------
// Duplicate Transaction Detection (§3.3)
// ---------------------------------------------------------------------------

export interface TransactionFingerprint {
  sellerId: string;
  buyerId: string | null;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  createdAt: Date;
  transactionId?: string;
}

export function isDuplicateTransaction(
  a: TransactionFingerprint,
  b: TransactionFingerprint,
  windowHours = 24,
): boolean {
  if (a.transactionId && b.transactionId && a.transactionId === b.transactionId) return true;
  const sameParties = a.sellerId === b.sellerId && a.buyerId === b.buyerId;
  const sameProduct = a.productId === b.productId;
  const sameQuantity = Math.abs(a.quantity - b.quantity) < 0.001;
  const samePrice = Math.abs(a.unitPrice - b.unitPrice) < 1;
  const withinWindow = Math.abs(a.createdAt.getTime() - b.createdAt.getTime()) < windowHours * 3600_000;
  return sameParties && sameProduct && sameQuantity && samePrice && withinWindow;
}

export function findDuplicateTransactions(
  transactions: TransactionFingerprint[],
  windowHours = 24,
): Array<[TransactionFingerprint, TransactionFingerprint]> {
  const pairs: Array<[TransactionFingerprint, TransactionFingerprint]> = [];
  for (let i = 0; i < transactions.length; i++) {
    for (let j = i + 1; j < transactions.length; j++) {
      if (isDuplicateTransaction(transactions[i], transactions[j], windowHours)) {
        pairs.push([transactions[i], transactions[j]]);
      }
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Price Anomaly Detection (§3.5, §10) — Median + IQR (Tukey fences)
// ---------------------------------------------------------------------------

export interface PriceAnomalyResult {
  isAnomaly: boolean;
  observedPrice: number;
  median: number;
  iqr: number;
  lowerBound: number;
  upperBound: number;
  deviationPct: number;
  direction: 'below' | 'above' | 'normal';
  sampleSize: number;
}

export function detectPriceAnomaly(
  price: number,
  comparisons: number[],
  iqrMultiplier = 1.5,
): PriceAnomalyResult | null {
  if (comparisons.length < 5) return null; // Insufficient data — spec §17 Test 5

  const sorted = [...comparisons].sort((a, b) => a - b);
  const n = sorted.length;
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  const q1 = sorted[Math.floor(n / 4)];
  const q3 = sorted[Math.floor((3 * n) / 4)];
  const iqr = q3 - q1;
  const lowerBound = median - iqrMultiplier * iqr;
  const upperBound = median + iqrMultiplier * iqr;
  const isAnomaly = price < lowerBound || price > upperBound;
  const deviationPct = median > 0 ? Math.round(Math.abs((price - median) / median) * 1000) / 10 : 0;
  const direction: PriceAnomalyResult['direction'] = price < lowerBound ? 'below' : price > upperBound ? 'above' : 'normal';

  return { isAnomaly, observedPrice: price, median: Math.round(median), iqr: Math.round(iqr), lowerBound: Math.round(lowerBound), upperBound: Math.round(upperBound), deviationPct, direction, sampleSize: n };
}

// ---------------------------------------------------------------------------
// Risk Score Calculation (§4.2) — Reproducible from stored indicators
// ---------------------------------------------------------------------------

export interface IndicatorScores {
  inventoryDiscrepancy: number;   // 0-100
  dispatchMismatch: number;       // 0-100
  transactionAnomaly: number;     // 0-100
  priceAnomaly: number;           // 0-100
  taxInconsistency: number;       // 0-100
  reportingInconsistency: number; // 0-100
  historicalFindings: number;     // 0-100
}

export interface ScoringWeights {
  inventoryDiscrepancy: number;
  dispatchMismatch: number;
  transactionAnomaly: number;
  priceAnomaly: number;
  taxInconsistency: number;
  reportingInconsistency: number;
  historicalFindings: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  inventoryDiscrepancy: 0.25,
  dispatchMismatch: 0.25,
  transactionAnomaly: 0.15,
  priceAnomaly: 0.15,
  taxInconsistency: 0.15,
  reportingInconsistency: 0.05,
  historicalFindings: 0.05,
};

export function calculateRiskScore(indicators: IndicatorScores, weights: ScoringWeights = DEFAULT_WEIGHTS): number {
  const weighted =
    indicators.inventoryDiscrepancy * weights.inventoryDiscrepancy +
    indicators.dispatchMismatch * weights.dispatchMismatch +
    indicators.transactionAnomaly * weights.transactionAnomaly +
    indicators.priceAnomaly * weights.priceAnomaly +
    indicators.taxInconsistency * weights.taxInconsistency +
    indicators.reportingInconsistency * weights.reportingInconsistency +
    indicators.historicalFindings * weights.historicalFindings;
  return Math.min(100, Math.round(weighted));
}

export function getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Data Quality Helpers (§11)
// ---------------------------------------------------------------------------

export function checkTransactionMath(quantity: number, unitPrice: number, totalAmount: number): number {
  return Math.abs(totalAmount - Math.round(quantity * unitPrice));
}

export function checkVatCalculation(totalAmount: number, vatAmount: number, vatRate = 0.18): number {
  return Math.abs(vatAmount - Math.round(totalAmount * vatRate));
}
