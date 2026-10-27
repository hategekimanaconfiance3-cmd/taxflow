import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeProductionMaterialEvidence } from '../lib/production-confidentiality';

test('standard compliance view projects protected material codes and strips confidential fields', () => {
  const detail = sanitizeProductionMaterialEvidence([{
    materialCode: 'M-001',
    confidentialName: 'proprietary ingredient name',
    unit: 'kg',
    plannedQuantity: 12,
    actualQuantity: 13,
    formulaSecret: 'must not pass through',
  }]);
  assert.deepEqual(detail, [{ materialCode: 'M-001', unit: 'kg', plannedQuantity: 12, actualQuantity: 13 }]);
  assert.equal(JSON.stringify(detail).includes('proprietary ingredient name'), false);
  assert.equal(JSON.stringify(detail).includes('formulaSecret'), false);
});
