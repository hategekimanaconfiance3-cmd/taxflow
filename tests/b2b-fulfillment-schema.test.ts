import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dispatchInputSchema, receiptInputSchema, representativeInviteSchema } from '../lib/validation/b2b-fulfillment.schema';

test('representative invitation normalizes email and rejects malformed addresses', () => {
  assert.deepEqual(representativeInviteSchema.parse({ email: '  Staff@Example.com  ' }), { email: 'staff@example.com' });
  assert.equal(representativeInviteSchema.safeParse({ email: 'not-an-email' }).success, false);
});

test('dispatch input requires positive quantity and UUID idempotency key', () => {
  const valid = { transactionId: '00000000-0000-4000-8000-000000000001', quantity: 2.5, idempotencyKey: '00000000-0000-4000-8000-000000000002' };
  assert.equal(dispatchInputSchema.safeParse(valid).success, true);
  assert.equal(dispatchInputSchema.safeParse({ ...valid, quantity: 0 }).success, false);
  assert.equal(dispatchInputSchema.safeParse({ ...valid, idempotencyKey: 'retry' }).success, false);
});

test('receipt classifications must be nonnegative and sum to measured receipt quantity', () => {
  const valid = {
    dispatchId: '00000000-0000-4000-8000-000000000003',
    quantityReceived: 10,
    acceptedQuantity: 7,
    damagedQuantity: 1,
    rejectedQuantity: 1,
    disputedQuantity: 1,
    idempotencyKey: '00000000-0000-4000-8000-000000000004',
  };
  assert.equal(receiptInputSchema.safeParse(valid).success, true);
  assert.equal(receiptInputSchema.safeParse({ ...valid, acceptedQuantity: 8 }).success, false);
  assert.equal(receiptInputSchema.safeParse({ ...valid, disputedQuantity: -1 }).success, false);
  assert.equal(receiptInputSchema.safeParse({ ...valid, quantityReceived: Number.NaN }).success, false);
});
