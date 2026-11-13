export const PAYMENT_STATUSES = [
  'DRAFT',
  'ELIGIBILITY_CHECKED',
  'READY_FOR_PAYMENT',
  'PAYMENT_INITIATED',
  'AWAITING_CONFIRMATION',
  'PROVIDER_CONFIRMED',
  'RECONCILIATION_PENDING',
  'PAID',
  'REVIEW_REQUIRED',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
  'REFUND_PENDING',
  'REFUNDED',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

const TRANSITIONS: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  DRAFT: ['ELIGIBILITY_CHECKED', 'CANCELLED'],
  ELIGIBILITY_CHECKED: ['READY_FOR_PAYMENT', 'REVIEW_REQUIRED', 'CANCELLED'],
  READY_FOR_PAYMENT: ['PAYMENT_INITIATED', 'CANCELLED', 'EXPIRED'],
  PAYMENT_INITIATED: ['AWAITING_CONFIRMATION', 'PROVIDER_CONFIRMED', 'REVIEW_REQUIRED', 'FAILED', 'EXPIRED'],
  AWAITING_CONFIRMATION: ['PROVIDER_CONFIRMED', 'REVIEW_REQUIRED', 'FAILED', 'EXPIRED'],
  PROVIDER_CONFIRMED: ['RECONCILIATION_PENDING', 'REVIEW_REQUIRED'],
  RECONCILIATION_PENDING: ['PAID', 'REVIEW_REQUIRED'],
  PAID: ['REFUND_PENDING'],
  REVIEW_REQUIRED: ['PROVIDER_CONFIRMED', 'RECONCILIATION_PENDING', 'FAILED', 'CANCELLED'],
  FAILED: [],
  EXPIRED: [],
  CANCELLED: [],
  REFUND_PENDING: ['REFUNDED', 'PAID', 'REVIEW_REQUIRED'],
  REFUNDED: [],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransitionPayment(from, to)) {
    throw new Error(`Payment transition ${from} → ${to} is not allowed.`);
  }
}

export type ScoreResult =
  | { state: 'insufficient_data'; score: null; reason: string }
  | { state: 'available'; score: number; numerator: number; denominator: number };

/** Calculates a score only from explicit, finite assessment inputs. */
export function calculateThresholdScore(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
): ScoreResult {
  if (
    numerator == null || denominator == null ||
    !Number.isFinite(numerator) || !Number.isFinite(denominator) ||
    numerator < 0 || denominator <= 0
  ) {
    return { state: 'insufficient_data', score: null, reason: 'Assessment data is missing or invalid.' };
  }

  return {
    state: 'available',
    score: Math.min(100, (numerator / denominator) * 100),
    numerator,
    denominator,
  };
}

export function meetsEligibilityThreshold(score: ScoreResult, threshold = 95): boolean | null {
  return score.state === 'insufficient_data' ? null : score.score >= threshold;
}

export function evaluateGatedPaymentEligibility(
  complianceScore: ScoreResult,
  periodPaymentScore: ScoreResult,
  threshold = 95,
): { complianceScore: ScoreResult; periodPaymentScore: ScoreResult; eligible: boolean | null } {
  const complianceEligible = meetsEligibilityThreshold(complianceScore, threshold);
  const paymentEligible = meetsEligibilityThreshold(periodPaymentScore, threshold);
  return {
    complianceScore,
    periodPaymentScore,
    eligible: complianceEligible === null || paymentEligible === null
      ? null
      : complianceEligible && paymentEligible,
  };
}

/** A genuine outstanding obligation remains payable regardless of activity eligibility. */
export function canInitiateTaxPayment(outstandingAmount: number | null | undefined): boolean {
  return outstandingAmount != null && Number.isSafeInteger(outstandingAmount) && outstandingAmount > 0;
}

export function verifyProviderAmount(expected: number, actual: number): boolean {
  return Number.isSafeInteger(expected) && Number.isSafeInteger(actual) && expected > 0 && actual === expected;
}

export type PaymentProvider = 'mtn_mobile_money' | 'airtel_money' | 'bank_gateway';

export interface ProviderInitiation {
  paymentReference: string;
  amount: number;
  currency: 'RWF';
  payerReference?: string;
}

export interface ProviderCallback {
  paymentReference: string;
  providerReference: string;
  amount: number;
  currency: string;
  payerReference?: string;
  outcome: 'success' | 'failed' | 'pending';
}

/** Adapter contract only: a production adapter must verify its documented provider signature. */
export interface PaymentProviderAdapter {
  readonly provider: PaymentProvider;
  initiatePayment(input: ProviderInitiation): Promise<{ providerReference: string; accepted: boolean }>;
  verifyCallback(rawBody: string, signature: string | null): Promise<ProviderCallback>;
}

export function validateProviderCallback(
  callback: ProviderCallback,
  expectedPaymentReference: string,
  expectedAmount: number,
): { valid: true } | { valid: false; mismatches: string[] } {
  const mismatches: string[] = [];
  if (!callback.providerReference.trim()) mismatches.push('provider_reference');
  if (callback.paymentReference !== expectedPaymentReference) mismatches.push('payment_reference');
  if (!verifyProviderAmount(expectedAmount, callback.amount)) mismatches.push('amount');
  if (callback.currency !== 'RWF') mismatches.push('currency');
  return mismatches.length ? { valid: false, mismatches } : { valid: true };
}

/** Safe default until provider contracts, credentials, and sandbox access are configured. */
export class ProviderNotConfiguredError extends Error {
  constructor(provider: PaymentProvider) {
    super(`The ${provider} payment integration is not configured. No payment was initiated.`);
    this.name = 'ProviderNotConfiguredError';
  }
}

export function createUnconfiguredProviderAdapter(provider: PaymentProvider): PaymentProviderAdapter {
  return {
    provider,
    async initiatePayment(): Promise<never> {
      throw new ProviderNotConfiguredError(provider);
    },
    async verifyCallback(): Promise<never> {
      throw new ProviderNotConfiguredError(provider);
    },
  };
}

export const PAYMENT_PROVIDER_ADAPTERS: Readonly<Record<PaymentProvider, PaymentProviderAdapter>> = {
  mtn_mobile_money: createUnconfiguredProviderAdapter('mtn_mobile_money'),
  airtel_money: createUnconfiguredProviderAdapter('airtel_money'),
  bank_gateway: createUnconfiguredProviderAdapter('bank_gateway'),
};
