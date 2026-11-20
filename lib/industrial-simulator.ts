import type { IndustrialEventInput } from '@/lib/validation/manufacturing-integration.schema';

export interface BeverageSimulationOptions {
  gatewayId: string;
  factoryId: string;
  lineId: string;
  equipmentId: string;
  batchId?: string;
  startAt?: Date;
  includeDiscrepancy?: boolean;
  includeCounterReset?: boolean;
}

export function createBeverageSimulationEvents(options: BeverageSimulationOptions): IndustrialEventInput[] {
  const start = options.startAt ?? new Date('2026-11-16T08:00:00.000Z');
  const stages = [
    ['RAW_MATERIAL_PREPARATION', 1],
    ['WATER_TREATMENT', 2],
    ['MIXING_FORMULATION', 3],
    ['FILLING', 4],
    ['CAPPING_SEALING', 5],
    ['LABELING', 6],
    ['PACKAGING', 7],
    ['QUALITY_INSPECTION', 8],
    ['FINISHED_GOODS_STORAGE', 9],
    ['DISPATCH', 10],
  ] as const;
  const events: IndustrialEventInput[] = stages.map(([stageCode, stageSequenceNumber], index) => ({
    eventId: `SIM-${options.equipmentId}-${index + 1}`,
    gatewayId: options.gatewayId,
    factoryId: options.factoryId,
    lineId: options.lineId,
    equipmentId: options.equipmentId,
    batchId: options.batchId ?? null,
    eventType: 'STAGE_COMPLETION',
    stageCode,
    stageSequenceNumber,
    sequenceNumber: index + 1,
    eventTimestamp: new Date(start.getTime() + index * 60_000).toISOString(),
    measurements: {},
    unit: 'stage',
    source: 'simulator',
    schemaVersion: '1.0',
  }));
  const produced = options.includeDiscrepancy ? 10_450 : 10_000;
  events.push({
    eventId: `SIM-${options.equipmentId}-COUNT-1`,
    gatewayId: options.gatewayId,
    factoryId: options.factoryId,
    lineId: options.lineId,
    equipmentId: options.equipmentId,
    batchId: options.batchId ?? null,
    eventType: 'PRODUCTION_COUNT',
    sequenceNumber: events.length + 1,
    eventTimestamp: new Date(start.getTime() + stages.length * 60_000).toISOString(),
    measurements: { bottlesProduced: produced, bottlesRejected: 12 },
    unit: 'bottles',
    source: 'simulator',
    schemaVersion: '1.0',
  });
  if (options.includeCounterReset) {
    events.push({
      eventId: `SIM-${options.equipmentId}-RESET-1`,
      gatewayId: options.gatewayId,
      factoryId: options.factoryId,
      lineId: options.lineId,
      equipmentId: options.equipmentId,
      batchId: options.batchId ?? null,
      eventType: 'COUNTER_RESET',
      sequenceNumber: events.length + 1,
      eventTimestamp: new Date(start.getTime() + (stages.length + 1) * 60_000).toISOString(),
      measurements: { bottlesProduced: 5 },
      unit: 'bottles',
      source: 'simulator',
      schemaVersion: '1.0',
    });
  }
  return events;
}

export class OfflineIndustrialEventBuffer {
  private readonly pending: IndustrialEventInput[] = [];

  enqueue(event: IndustrialEventInput): void {
    if (!this.pending.some((candidate) => candidate.eventId === event.eventId)) this.pending.push(event);
  }

  size(): number { return this.pending.length; }

  peek(limit = this.pending.length): IndustrialEventInput[] {
    return this.pending.slice(0, Math.max(0, limit));
  }

  acknowledge(eventIds: string[]): void {
    const ids = new Set(eventIds);
    for (let index = this.pending.length - 1; index >= 0; index -= 1) {
      if (ids.has(this.pending[index].eventId)) this.pending.splice(index, 1);
    }
  }

  retainFailed(eventIds: string[]): void {
    const ids = new Set(eventIds);
    for (let index = this.pending.length - 1; index >= 0; index -= 1) {
      if (!ids.has(this.pending[index].eventId)) this.pending.splice(index, 1);
    }
  }
}
