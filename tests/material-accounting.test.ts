import { describe, expect, it } from 'vitest';
import { decimalToMicros, microsToDecimal, multiplyQuantities, normalizeMaterialUnit, quantityToMicros } from '@/lib/material-accounting';

describe('confidential material fixed-point arithmetic', () => {
  it('round-trips six-place quantities without floating-point drift', () => {
    for (const value of ['0', '1', '12.34', '0.000001', '999999999.999999']) {
      expect(microsToDecimal(decimalToMicros(value))).toBe(value.replace(/\.0+$/, ''));
    }
  });

  it('converts validated quantities and rejects precision beyond six places', () => {
    expect(quantityToMicros(0.125)).toBe(BigInt(125_000));
    expect(() => quantityToMicros(0.0000001)).toThrow('Quantity supports at most 6 decimal places.');
  });

  it('scales recipe consumption with deterministic half-up rounding', () => {
    expect(microsToDecimal(multiplyQuantities(BigInt(3_000_000), BigInt(250_000), BigInt(1_000_000)))).toBe('0.75');
    expect(microsToDecimal(multiplyQuantities(BigInt(1_000_000), BigInt(1), BigInt(3_000_000)))).toBe('0.000001');
  });

  it('normalizes units for comparisons without changing protected labels', () => {
    expect(normalizeMaterialUnit(' KG ')).toBe('kg');
  });
});
