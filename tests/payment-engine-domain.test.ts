import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PAYMENT_PROVIDER_ADAPTERS,
  ProviderNotConfiguredError,
  assertPaymentTransition,
  calculateThresholdScore,
  canInitiateTaxPayment,
  evaluateGatedPaymentEligibility,
  meetsEligibilityThreshold,
  validateProviderCallback,
  verifyProviderAmount,
} from '../lib/payment-engine/domain';

test('95 percent threshold is evaluated separately and insufficient assessments stay unknown', () => {
  const atThreshold = calculateThresholdScore(95, 100);
  const belowThreshold = calculateThresholdScore(94, 100);
  const missing = calculateThresholdScore(null, null);
  assert.equal(meetsEligibilityThreshold(atThreshold), true);
  assert.equal(meetsEligibilityThreshold(belowThreshold), false);
  assert.equal(meetsEligibilityThreshold(missing), null);
  assert.equal(missing.state, 'insufficient_data');
});

test('low eligibility never prevents payment of a genuine outstanding balance', () => {
  const gatedEligibility = evaluateGatedPaymentEligibility(
    calculateThresholdScore(70, 100),
    calculateThresholdScore(100, 100),
  );
  assert.equal(gatedEligibility.eligible, false);
  assert.equal(canInitiateTaxPayment(100), true);
  assert.equal(canInitiateTaxPayment(0), false);
  assert.equal(canInitiateTaxPayment(null), false);
});

test('provider-reported payment amount must exactly match the server amount', () => {
  assert.equal(verifyProviderAmount(1200, 1200), true);
  assert.equal(verifyProviderAmount(1200, 1199), false);
  assert.equal(verifyProviderAmount(1200, 1201), false);
});

test('callback reconciliation rejects a wrong reference, amount, or currency', () => {
  const valid = validateProviderCallback({
    paymentReference: 'TF-1', providerReference: 'BANK-1', amount: 1200, currency: 'RWF', outcome: 'success',
  }, 'TF-1', 1200);
  const forged = validateProviderCallback({
    paymentReference: 'TF-other', providerReference: '', amount: 1199, currency: 'USD', outcome: 'success',
  }, 'TF-1', 1200);
  assert.deepEqual(valid, { valid: true });
  assert.deepEqual(forged, { valid: false, mismatches: ['provider_reference', 'payment_reference', 'amount', 'currency'] });
});

test('payment states only allow explicit forward transitions', () => {
  assert.doesNotThrow(() => assertPaymentTransition('PAYMENT_INITIATED', 'AWAITING_CONFIRMATION'));
  assert.doesNotThrow(() => assertPaymentTransition('AWAITING_CONFIRMATION', 'REVIEW_REQUIRED'));
  assert.doesNotThrow(() => assertPaymentTransition('REVIEW_REQUIRED', 'RECONCILIATION_PENDING'));
  assert.doesNotThrow(() => assertPaymentTransition('RECONCILIATION_PENDING', 'PAID'));
  assert.throws(() => assertPaymentTransition('PAID', 'PAYMENT_INITIATED'));
  assert.throws(() => assertPaymentTransition('FAILED', 'PAID'));
});

test('provider adapters fail closed when no provider integration is configured', async () => {
  const adapter = PAYMENT_PROVIDER_ADAPTERS.mtn_mobile_money;
  await assert.rejects(
    adapter.initiatePayment({ paymentReference: 'TF-test', amount: 100, currency: 'RWF' }),
    ProviderNotConfiguredError,
  );
  await assert.rejects(adapter.verifyCallback('{}', null), ProviderNotConfiguredError);
});
