import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { customerSchema } from '../lib/validation/customer.schema';

describe('customer directory validation', () => {
  it('accepts individual walk-in details without requiring a TIN', () => {
    const result = customerSchema.safeParse({ name: 'Walk-in customer', customerType: 'individual' });
    assert.equal(result.success, true);
  });

  it('accepts a business contact with an optional nine-digit TIN', () => {
    const result = customerSchema.safeParse({
      name: 'Example Trading Ltd', customerType: 'business', tinNumber: '101000001', phone: '+250700000000',
    });
    assert.equal(result.success, true);
  });

  it('rejects malformed TINs and empty names', () => {
    assert.equal(customerSchema.safeParse({ name: 'Business', customerType: 'business', tinNumber: '123' }).success, false);
    assert.equal(customerSchema.safeParse({ name: ' ', customerType: 'individual' }).success, false);
  });

  it('rejects unsupported customer categories and invalid email addresses', () => {
    assert.equal(customerSchema.safeParse({ name: 'Customer', customerType: 'government' }).success, false);
    assert.equal(customerSchema.safeParse({ name: 'Customer', customerType: 'individual', email: 'bad-email' }).success, false);
  });
});
