import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculatePercentageChange, priceDirection } from '../lib/price-monitoring-domain';
import { merchantPriceUpdateSchema, priceAlertQuerySchema } from '../lib/validation/price-monitoring.schema';
import { hasRRAPermission } from '../lib/rra-rbac';

test('price monitoring calculates increases and decreases from the previous valid price', () => {
  assert.equal(calculatePercentageChange(5_000, 5_500), 10);
  assert.equal(calculatePercentageChange(2_000, 1_800), -10);
  assert.equal(calculatePercentageChange(3_000, 3_600), 20);
});

test('price monitoring distinguishes increase, decrease, and unchanged prices', () => {
  assert.equal(priceDirection(100, 120), 'increase');
  assert.equal(priceDirection(100, 80), 'decrease');
  assert.equal(priceDirection(100, 100), 'unchanged');
});

test('price monitoring rejects invalid percentage inputs', () => {
  assert.throws(() => calculatePercentageChange(0, 100), /positive/);
  assert.throws(() => calculatePercentageChange(100, 0), /positive/);
});

test('merchant price updates require a positive whole-number price and idempotency key', () => {
  const valid = merchantPriceUpdateSchema.safeParse({ price: 5_500, reason: 'Supplier cost changed', idempotencyKey: '4f6f5f20-cd86-4a6d-92ea-94bc8ae5fd93' });
  assert.equal(valid.success, true);
  assert.equal(merchantPriceUpdateSchema.safeParse({ price: 0, idempotencyKey: '4f6f5f20-cd86-4a6d-92ea-94bc8ae5fd93' }).success, false);
  assert.equal(merchantPriceUpdateSchema.safeParse({ price: 5_500, idempotencyKey: 'not-a-uuid' }).success, false);
});

test('price alert permissions are explicit and do not grant jurisdiction management to ordinary officers', () => {
  assert.equal(hasRRAPermission('tax_compliance_officer', 'price.alert.read'), true);
  assert.equal(hasRRAPermission('tax_compliance_officer', 'price.alert.review'), true);
  assert.equal(hasRRAPermission('tax_compliance_officer', 'price.jurisdiction.manage'), false);
  assert.equal(hasRRAPermission('super_admin', 'price.alert.read'), true);
  assert.equal(hasRRAPermission('super_admin', 'price.jurisdiction.manage'), true);
});

test('price alert filters accept percentage ranges and reject reversed ranges', () => {
  assert.equal(priceAlertQuerySchema.safeParse({ minPercentage: '-5', maxPercentage: '20' }).success, true);
  assert.equal(priceAlertQuerySchema.safeParse({ minPercentage: '20', maxPercentage: '5' }).success, false);
});

