import assert from 'node:assert/strict';
import test from 'node:test';
import { productionEntrySchema, productRegistrationSchema } from '../lib/validation/production.schema';

test('production entry accepts a valid manufacturer submission and zero unit price', () => {
  const parsed = productionEntrySchema.safeParse({
    productId: 'd2719b25-2f2c-4fa0-a2fc-ae9e2218a6b2',
    quantity: 1000,
    unitPrice: 7000,
    idempotencyKey: '78a2f784-9e22-4810-aebf-a0f283dba2f0',
  });
  assert.equal(parsed.success, true);

  const zeroPrice = productionEntrySchema.safeParse({
    productId: 'd2719b25-2f2c-4fa0-a2fc-ae9e2218a6b2',
    quantity: 10,
    unitPrice: 0,
    idempotencyKey: '78a2f784-9e22-4810-aebf-a0f283dba2f0',
  });
  assert.equal(zeroPrice.success, true);
});

test('production entry rejects zero quantity, empty product ids, and negative prices', () => {
  const base = {
    productId: 'd2719b25-2f2c-4fa0-a2fc-ae9e2218a6b2',
    quantity: 1000,
    unitPrice: 7000,
    idempotencyKey: '78a2f784-9e22-4810-aebf-a0f283dba2f0',
  };
  assert.equal(productionEntrySchema.safeParse({ ...base, quantity: 0 }).success, false);
  assert.equal(productionEntrySchema.safeParse({ ...base, productId: '' }).success, false);
  assert.equal(productionEntrySchema.safeParse({ ...base, unitPrice: -1 }).success, false);
  assert.equal(productionEntrySchema.safeParse({ ...base, idempotencyKey: 'not-a-key' }).success, false);
});

test('product registration validates unit and trims the name', () => {
  const parsed = productRegistrationSchema.safeParse({ name: '  Soap  ', unit: 'box', categoryCode: 'GOODS' });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.name, 'Soap');
  assert.equal(productRegistrationSchema.safeParse({ name: 'Soap', unit: 'unknown' }).success, false);
});
