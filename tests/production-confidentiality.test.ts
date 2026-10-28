import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessMaterialVariance, calculatePlannedMaterialQuantity, combineMaterialValidation } from '../lib/production-confidentiality';

test('recipe quantities scale deterministically to the batch output', () => {
  assert.equal(calculatePlannedMaterialQuantity(250, 100, 12), 30);
  assert.equal(calculatePlannedMaterialQuantity(1, 3, 2), 2 / 3);
});

test('material variances use the recipe tolerance and produce a review signal', () => {
  assert.deepEqual(assessMaterialVariance(100, 102.5, 250), { status: 'within_tolerance', varianceBasisPoints: 250 });
  assert.deepEqual(assessMaterialVariance(100, 103, 250), { status: 'review_required', varianceBasisPoints: 300 });
  assert.deepEqual(assessMaterialVariance(100, 0, 10_000), { status: 'within_tolerance', varianceBasisPoints: 10_000 });
  assert.throws(() => assessMaterialVariance(0, 1, 100));
});

test('one material outside tolerance requires review for the batch', () => {
  assert.equal(combineMaterialValidation(['within_tolerance', 'within_tolerance']), 'within_tolerance');
  assert.equal(combineMaterialValidation(['within_tolerance', 'review_required']), 'review_required');
  assert.throws(() => calculatePlannedMaterialQuantity(0, 1, 1));
});
