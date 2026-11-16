import assert from 'node:assert/strict';
import test from 'node:test';
import {
  factoryRegistrationSchema,
  productionLineRegistrationSchema,
} from '@/lib/validation/manufacturing-integration.schema';

test('factory registration accepts a beverage factory with optional coordinates and capacity', () => {
  const result = factoryRegistrationSchema.safeParse({
    factoryCode: 'KGL-01',
    name: 'Kigali Beverage Plant',
    address: 'Kigali, Rwanda',
    latitude: -1.9441,
    longitude: 30.0619,
    productionCapacity: 100_000,
    productionCapacityUnit: 'bottles/day',
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.industryType, 'beverage');
  }
});

test('factory registration rejects incomplete coordinate and capacity pairs', () => {
  const result = factoryRegistrationSchema.safeParse({
    factoryCode: 'KGL-01',
    name: 'Kigali Beverage Plant',
    address: 'Kigali, Rwanda',
    latitude: -1.9441,
    productionCapacity: 100_000,
  });

  assert.equal(result.success, false);
});

test('production line registration rejects duplicate stage codes and sequence numbers', () => {
  const result = productionLineRegistrationSchema.safeParse({
    factoryId: '00000000-0000-4000-8000-000000000001',
    lineCode: 'LINE-01',
    name: 'Bottling line 1',
    stages: [
      { stageCode: 'FILLING', name: 'Filling', sequenceNumber: 1 },
      { stageCode: 'filling', name: 'Duplicate filling', sequenceNumber: 2 },
      { stageCode: 'PACKAGING', name: 'Packaging', sequenceNumber: 1 },
    ],
  });

  assert.equal(result.success, false);
});

test('production line registration accepts ordered industry-neutral stages', () => {
  const result = productionLineRegistrationSchema.safeParse({
    factoryId: '00000000-0000-4000-8000-000000000001',
    lineCode: 'LINE-01',
    name: 'Bottling line 1',
    productTypes: ['bottled water', 'juice'],
    stages: [
      { stageCode: 'MIXING', name: 'Mixing', sequenceNumber: 1 },
      { stageCode: 'FILLING', name: 'Filling', sequenceNumber: 2 },
    ],
  });

  assert.equal(result.success, true);
});
