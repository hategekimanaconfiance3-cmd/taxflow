import assert from 'node:assert/strict';
import test from 'node:test';
import { industrialEventSchema } from '@/lib/validation/manufacturing-integration.schema';

const baseEvent = {
  eventId: 'GW-01-10542',
  gatewayId: '00000000-0000-4000-8000-000000000001',
  factoryId: '00000000-0000-4000-8000-000000000002',
  lineId: '00000000-0000-4000-8000-000000000003',
  equipmentId: '00000000-0000-4000-8000-000000000004',
  batchId: '00000000-0000-4000-8000-000000000005',
  eventType: 'PRODUCTION_COUNT' as const,
  sequenceNumber: 10542,
  eventTimestamp: '2026-11-16T08:30:00.000Z',
  measurements: { bottlesProduced: 500, bottlesRejected: 4, productionRate: 60 },
  unit: 'bottles',
  source: 'industrial_gateway' as const,
  schemaVersion: '1.0',
};

test('industrial event contract accepts a versioned production count', () => {
  const result = industrialEventSchema.safeParse(baseEvent);
  assert.equal(result.success, true);
});

test('industrial event contract rejects negative counts and unknown fields', () => {
  assert.equal(industrialEventSchema.safeParse({ ...baseEvent, measurements: { bottlesProduced: -1 } }).success, false);
  assert.equal(industrialEventSchema.safeParse({ ...baseEvent, unexpected: true }).success, false);
});

test('industrial event contract accepts explicit simulated evidence', () => {
  const result = industrialEventSchema.safeParse({ ...baseEvent, source: 'simulator', stageCode: 'FILLING', stageSequenceNumber: 4 });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.source, 'simulator');
});
