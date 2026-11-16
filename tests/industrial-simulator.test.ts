import assert from 'node:assert/strict';
import test from 'node:test';
import { createBeverageSimulationEvents, OfflineIndustrialEventBuffer } from '@/lib/industrial-simulator';

const ids = {
  gatewayId: '00000000-0000-4000-8000-000000000001',
  factoryId: '00000000-0000-4000-8000-000000000002',
  lineId: '00000000-0000-4000-8000-000000000003',
  equipmentId: '00000000-0000-4000-8000-000000000004',
  batchId: '00000000-0000-4000-8000-000000000005',
};

test('beverage simulator emits explicitly simulated stage and counter evidence', () => {
  const events = createBeverageSimulationEvents({ ...ids, includeDiscrepancy: true, includeCounterReset: true });
  assert.equal(events.every((event) => event.source === 'simulator'), true);
  assert.equal(events.filter((event) => event.eventType === 'STAGE_COMPLETION').length, 10);
  assert.equal(events.some((event) => event.measurements.bottlesProduced === 10_450), true);
});

test('offline buffer deduplicates events and removes only acknowledged events', () => {
  const [first, second] = createBeverageSimulationEvents(ids);
  const buffer = new OfflineIndustrialEventBuffer();
  buffer.enqueue(first);
  buffer.enqueue(first);
  buffer.enqueue(second);
  assert.equal(buffer.size(), 2);
  buffer.acknowledge([first.eventId]);
  assert.equal(buffer.size(), 1);
  assert.equal(buffer.peek()[0]?.eventId, second.eventId);
});
