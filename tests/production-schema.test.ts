import assert from 'node:assert/strict';
import test from 'node:test';
import {
  productionBatchMaterialReviewSchema,
  productionEntrySchema,
  productionFormulaAccessSchema,
  productionMaterialReceiptSchema,
  productionRecipeSchema,
  productionToleranceStandardCreateSchema,
  productRegistrationSchema,
} from '../lib/validation/production.schema';

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

test('recipe versions validate bounded materials and do not accept manufacturer-configured tolerance', () => {
  const valid = {
    productId: 'product-1',
    outputQuantity: 100,
    materials: [{ name: 'Base oil', unit: 'kg', quantity: 20 }],
  };
  assert.equal(productionRecipeSchema.safeParse(valid).success, true);
  assert.equal(productionRecipeSchema.safeParse({ ...valid, materials: [...valid.materials, { name: ' base OIL ', unit: 'kg', quantity: 2 }] }).success, false);
  assert.equal(productionRecipeSchema.safeParse({ ...valid, materials: [{ name: 'x', unit: 'kg', quantity: 0 }] }).success, false);
  assert.equal(productionRecipeSchema.safeParse({ ...valid, yieldToleranceBasisPoints: 250 }).success, false);
  assert.equal(productionRecipeSchema.safeParse({
    ...valid,
    materials: [{ name: 'x', unit: 'kg', quantity: 2, consumptionToleranceBasisPoints: 1_250 }],
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
    materialPlanId: 'plan-1',
    goodOutputQuantity: 48,
    rejectedOutputQuantity: 2,
  };
  assert.equal(productionEntrySchema.safeParse({ ...base, actualMaterials: [{ recipeMaterialId: 'line-1', actualQuantity: 2 }] }).success, true);
  assert.equal(productionEntrySchema.safeParse({ ...base, plannedOutputQuantity: undefined, actualMaterials: [{ recipeMaterialId: 'line-1', actualQuantity: 2 }] }).success, false);
  assert.equal(productionEntrySchema.safeParse({ ...base, materialPlanId: undefined, actualMaterials: [{ recipeMaterialId: 'line-1', actualQuantity: 2 }] }).success, false);
  assert.equal(productionEntrySchema.safeParse({ ...base, rejectedOutputQuantity: 1, actualMaterials: [{ recipeMaterialId: 'line-1', actualQuantity: 2 }] }).success, false);
  assert.equal(productionEntrySchema.safeParse({ ...base, actualMaterials: [] }).success, false);
  assert.equal(productionEntrySchema.safeParse({ ...base, actualMaterials: [
    { recipeMaterialId: 'line-1', actualQuantity: 2 },
    { recipeMaterialId: 'line-1', actualQuantity: 3 },
  ] }).success, false);
  assert.equal(productionEntrySchema.safeParse({ ...base, actualMaterials: [{ recipeMaterialId: 'line-1', actualQuantity: -1 }] }).success, false);
  assert.equal(productionEntrySchema.safeParse({ ...base, actualMaterials: [{ recipeMaterialId: 'line-1', actualQuantity: 2, wasteQuantity: 3 }] }).success, false);
});

test('batch release requires independent good/reject quantities and evidence', () => {
  const base = { batchId: 'batch-1', decision: 'release' as const, note: 'Reviewed batch evidence' };
  assert.equal(productionBatchMaterialReviewSchema.safeParse({ ...base, goodOutputQuantity: 48, rejectedOutputQuantity: 2, outputEvidenceReference: 'inspection-123' }).success, true);
  assert.equal(productionBatchMaterialReviewSchema.safeParse(base).success, false);
  assert.equal(productionBatchMaterialReviewSchema.safeParse({ ...base, goodOutputQuantity: 50, outputEvidenceReference: 'inspection-123' }).success, false);
  assert.equal(productionBatchMaterialReviewSchema.safeParse({ ...base, goodOutputQuantity: 48, rejectedOutputQuantity: 2 }).success, false);
  assert.equal(productionBatchMaterialReviewSchema.safeParse({ ...base, decision: 'reject', goodOutputQuantity: 48, rejectedOutputQuantity: 2, outputEvidenceReference: 'inspection-123' }).success, false);
});

test('receipt claims require origin-specific source evidence and exact declared units remain server-checked', () => {
  const base = { materialId: 'material-1', evidenceReference: 'invoice-123', quantity: 5, idempotencyKey: '78a2f784-9e22-4810-aebf-a0f283dba2f0' };
  assert.equal(productionMaterialReceiptSchema.safeParse({ ...base, origin: 'import', importDeclarationId: 'import-1' }).success, true);
  assert.equal(productionMaterialReceiptSchema.safeParse({ ...base, origin: 'import' }).success, false);
  assert.equal(productionMaterialReceiptSchema.safeParse({ ...base, origin: 'domestic', transactionId: 'transaction-1' }).success, true);
  assert.equal(productionMaterialReceiptSchema.safeParse({ ...base, origin: 'domestic' }).success, false);
  assert.equal(productionMaterialReceiptSchema.safeParse({ ...base, origin: 'opening_balance' }).success, true);
  assert.equal(productionMaterialReceiptSchema.safeParse({ ...base, origin: 'opening_balance', transactionId: 'transaction-1' }).success, false);
});

test('official tolerance standards require scoped, justified, evidence-backed values', () => {
  const base = {
    recipeVersionId: 'recipe-1',
    toleranceType: 'yield' as const,
    toleranceBasisPoints: 250,
    toleranceUnit: 'basis_points' as const,
    effectiveAt: '2026-10-30T12:00:00.000Z',
    justification: 'Validated from approved production samples.',
    evidenceReference: 'standard-review-1',
  };
  assert.equal(productionToleranceStandardCreateSchema.safeParse(base).success, true);
  assert.equal(productionToleranceStandardCreateSchema.safeParse({ ...base, toleranceBasisPoints: 10_001 }).success, false);
  assert.equal(productionToleranceStandardCreateSchema.safeParse({ ...base, materialId: 'material-1' }).success, false);
  assert.equal(productionToleranceStandardCreateSchema.safeParse({ ...base, toleranceType: 'material_consumption', materialId: 'material-1' }).success, true);
  assert.equal(productionToleranceStandardCreateSchema.safeParse({ ...base, toleranceType: 'material_consumption' }).success, false);
  assert.equal(productionToleranceStandardCreateSchema.safeParse({ ...base, toleranceUnit: 'percent' }).success, false);
});

test('specialist formula access uses documented purposes and requires an assigned case reference for case work', () => {
  assert.equal(productionFormulaAccessSchema.safeParse({ batchId: 'batch-1', reason: 'production_discrepancy' }).success, true);
  assert.equal(productionFormulaAccessSchema.safeParse({ batchId: 'batch-1', reason: 'investigation_case' }).success, false);
  assert.equal(productionFormulaAccessSchema.safeParse({ batchId: 'batch-1', reason: 'investigation_case', caseReference: 'case-1' }).success, true);
  assert.equal(productionFormulaAccessSchema.safeParse({ batchId: 'batch-1', reason: 'free_text_reason', caseReference: 'case-1' }).success, false);
});
