import assert from 'node:assert/strict';
import test from 'node:test';
import { productionEntrySchema, productionFormulaAccessSchema, productionRecipeSchema, productRegistrationSchema } from '../lib/validation/production.schema';

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

test('recipe versions validate bounded materials, unique names, output, and tolerance', () => {
  const valid = {
    productId: 'product-1',
    outputQuantity: 100,
    yieldToleranceBasisPoints: 250,
    materials: [{ name: 'Base oil', unit: 'kg', quantity: 20 }],
  };
  assert.equal(productionRecipeSchema.safeParse(valid).success, true);
  assert.equal(productionRecipeSchema.safeParse({ ...valid, materials: [...valid.materials, { name: ' base OIL ', unit: 'kg', quantity: 2 }] }).success, false);
  assert.equal(productionRecipeSchema.safeParse({ ...valid, yieldToleranceBasisPoints: 10_001 }).success, false);
  assert.equal(productionRecipeSchema.safeParse({ ...valid, materials: [{ name: 'x', unit: 'kg', quantity: 0 }] }).success, false);
  assert.equal(productionRecipeSchema.safeParse({
    ...valid,
    materials: [{ name: 'x', unit: 'kg', quantity: 2, consumptionToleranceBasisPoints: 1_250 }],
  }).success, true);
  assert.equal(productionRecipeSchema.safeParse({
    ...valid,
    materials: [{ name: 'x', unit: 'kg', quantity: 2, consumptionToleranceBasisPoints: 10_001 }],
  }).success, false);
});

test('production recipe usage requires a complete unique line set', () => {
  const base = {
    productId: 'product-1',
    quantity: 50,
    unitPrice: 1,
    idempotencyKey: '78a2f784-9e22-4810-aebf-a0f283dba2f0',
    recipeVersionId: 'recipe-1',
    plannedOutputQuantity: 50,
  };
  assert.equal(productionEntrySchema.safeParse({ ...base, actualMaterials: [{ recipeMaterialId: 'line-1', actualQuantity: 2 }] }).success, true);
  assert.equal(productionEntrySchema.safeParse({ ...base, plannedOutputQuantity: undefined, actualMaterials: [{ recipeMaterialId: 'line-1', actualQuantity: 2 }] }).success, false);
  assert.equal(productionEntrySchema.safeParse({ ...base, actualMaterials: [] }).success, false);
  assert.equal(productionEntrySchema.safeParse({ ...base, actualMaterials: [
    { recipeMaterialId: 'line-1', actualQuantity: 2 },
    { recipeMaterialId: 'line-1', actualQuantity: 3 },
  ] }).success, false);
  assert.equal(productionEntrySchema.safeParse({ ...base, actualMaterials: [{ recipeMaterialId: 'line-1', actualQuantity: -1 }] }).success, false);
});

test('specialist formula access uses documented purposes and requires an assigned case reference for case work', () => {
  assert.equal(productionFormulaAccessSchema.safeParse({ batchId: 'batch-1', reason: 'production_discrepancy' }).success, true);
  assert.equal(productionFormulaAccessSchema.safeParse({ batchId: 'batch-1', reason: 'investigation_case' }).success, false);
  assert.equal(productionFormulaAccessSchema.safeParse({ batchId: 'batch-1', reason: 'investigation_case', caseReference: 'case-1' }).success, true);
  assert.equal(productionFormulaAccessSchema.safeParse({ batchId: 'batch-1', reason: 'free_text_reason', caseReference: 'case-1' }).success, false);
});
