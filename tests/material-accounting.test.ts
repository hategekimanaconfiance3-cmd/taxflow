import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decimalToMicros, microsToDecimal, multiplyQuantities, normalizeMaterialUnit, quantityToMicros } from '../lib/material-accounting';

describe('confidential material fixed-point arithmetic', () => {
  it('round-trips six-place quantities without floating-point drift', () => {
    for (const value of ['0', '1', '12.34', '0.000001', '999999999.999999']) {
      assert.equal(microsToDecimal(decimalToMicros(value)), value.replace(/\.0+$/, ''));
    }
  });

  it('converts validated quantities and rejects precision beyond six places', () => {
    assert.equal(quantityToMicros(0.125), BigInt(125_000));
    assert.equal(quantityToMicros(0), BigInt(0));
    assert.throws(() => quantityToMicros(0.0000001), /at most 6 decimal places/);
  });

  it('scales recipe consumption with deterministic half-up rounding', () => {
    assert.equal(microsToDecimal(multiplyQuantities(BigInt(3_000_000), BigInt(250_000), BigInt(1_000_000))), '0.75');
    assert.equal(microsToDecimal(multiplyQuantities(BigInt(1_000_000), BigInt(1), BigInt(3_000_000))), '0.000001');
  });

  it('matches only identical units after trimming and case normalization', () => {
    assert.equal(normalizeMaterialUnit(' KG '), normalizeMaterialUnit('kg'));
    assert.notEqual(normalizeMaterialUnit('kg'), normalizeMaterialUnit('ton'));
    assert.notEqual(normalizeMaterialUnit('liter'), normalizeMaterialUnit('L'));
  });
});
