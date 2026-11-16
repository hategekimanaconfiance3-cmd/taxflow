import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import db from '@/db/drizzle';
import {
  auditLog,
  factory,
  factoryProductionLine,
  industrialEquipment,
  industrialEquipmentCalibration,
  industrialBatchEvidence,
  industrialBatchStageHistory,
  industrialAlert,
  industrialComplianceIncident,
  industrialEvent,
  industrialEventSequence,
  industrialEventSync,
  industrialGateway,
  industrialGatewayConnection,
  industrialGatewayCredential,
  industrialIntegrationPolicy,
  industrialVerificationResult,
  notification,
  productionBatch,
} from '@/db/schema';
import {
  calibrationRecordSchema,
  equipmentRegistrationSchema,
  equipmentUpdateSchema,
  gatewayRegistrationSchema,
  industrialEventSchema,
  integrationPolicySchema,
  type CalibrationRecordInput,
  type EquipmentRegistrationInput,
  type EquipmentUpdateInput,
  type GatewayRegistrationInput,
  type IndustrialEventInput,
  type IntegrationPolicyInput,
} from '@/lib/validation/manufacturing-integration.schema';

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function equalHash(expected: string, supplied: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'hex');
  const suppliedBuffer = Buffer.from(supplied, 'hex');
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function payloadHash(payload: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function readCounter(measurements: Record<string, number>): number | null {
  for (const key of ['productionCounter', 'totalProduced', 'bottlesProduced', 'counter']) {
    const value = measurements[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

export async function registerEquipment(manufacturerId: string, rawInput: unknown) {
  const parsed = equipmentRegistrationSchema.safeParse(rawInput);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Equipment details are invalid.');
  const input: EquipmentRegistrationInput = parsed.data;

  const [ownedLine] = await db
    .select({ factoryId: factory.id, manufacturerId: factory.manufacturerId })
    .from(factoryProductionLine)
    .innerJoin(factory, eq(factory.id, factoryProductionLine.factoryId))
    .where(and(
      eq(factoryProductionLine.id, input.productionLineId),
      eq(factoryProductionLine.factoryId, input.factoryId),
      eq(factory.manufacturerId, manufacturerId),
      eq(factoryProductionLine.manufacturerId, manufacturerId),
    ))
    .limit(1);
  if (!ownedLine) throw new Error('Production line is not owned by this manufacturer or does not belong to the factory.');

  return db.transaction(async (tx) => {
    const [created] = await tx.insert(industrialEquipment).values({
      manufacturerId,
      factoryId: input.factoryId,
      productionLineId: input.productionLineId,
      equipmentCode: input.equipmentCode,
      name: input.name,
      equipmentType: input.equipmentType,
      equipmentManufacturer: input.equipmentManufacturer || null,
      model: input.model || null,
      serialNumber: input.serialNumber || null,
      installationDate: input.installationDate ? new Date(input.installationDate) : null,
      operationalStatus: input.operationalStatus,
      communicationProtocol: input.communicationProtocol,
      integrationMethod: input.integrationMethod,
      sensorConfiguration: input.sensorConfiguration,
      measurementUnits: input.measurementUnits,
      expectedProductionCapacity: input.expectedProductionCapacity == null ? null : String(input.expectedProductionCapacity),
      expectedProductionCapacityUnit: input.expectedProductionCapacityUnit || null,
    }).returning();
    if (!created) throw new Error('Equipment registration returned no record.');
    await tx.insert(auditLog).values({
      userId: manufacturerId,
      action: 'INDUSTRIAL_EQUIPMENT_REGISTERED',
      targetType: 'industrial_equipment',
      targetId: created.id,
      afterState: { factoryId: created.factoryId, productionLineId: created.productionLineId, operationalStatus: created.operationalStatus },
      metadata: JSON.stringify({ equipmentCode: created.equipmentCode, equipmentType: created.equipmentType }),
    });
    return created;
  });
}

export async function listManufacturerEquipment(manufacturerId: string) {
  return db
    .select()
    .from(industrialEquipment)
    .where(eq(industrialEquipment.manufacturerId, manufacturerId))
    .orderBy(asc(industrialEquipment.factoryId), asc(industrialEquipment.equipmentCode));
}

export async function updateEquipment(manufacturerId: string, rawInput: unknown) {
  const parsed = equipmentUpdateSchema.safeParse(rawInput);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Equipment update is invalid.');
  const input: EquipmentUpdateInput = parsed.data;
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(industrialEquipment)
      .where(and(eq(industrialEquipment.id, input.equipmentId), eq(industrialEquipment.manufacturerId, manufacturerId)))
      .for('update').limit(1);
    if (!current) throw new Error('Equipment not found.');
    if (current.operationalStatus === 'removed') throw new Error('Removed equipment is immutable and cannot be reactivated.');
    const [updated] = await tx.update(industrialEquipment).set({
      operationalStatus: input.operationalStatus ?? current.operationalStatus,
      communicationProtocol: input.communicationProtocol ?? current.communicationProtocol,
      integrationMethod: input.integrationMethod ?? current.integrationMethod,
      sensorConfiguration: input.sensorConfiguration ?? current.sensorConfiguration,
      measurementUnits: input.measurementUnits ?? current.measurementUnits,
      removedAt: input.operationalStatus === 'removed' ? new Date() : current.removedAt,
    }).where(eq(industrialEquipment.id, input.equipmentId)).returning();
    if (!updated) throw new Error('Equipment update failed.');
    await tx.insert(auditLog).values({
      userId: manufacturerId,
      action: input.operationalStatus === 'removed' ? 'INDUSTRIAL_EQUIPMENT_REMOVED' : 'INDUSTRIAL_EQUIPMENT_CONFIGURATION_UPDATED',
      targetType: 'industrial_equipment',
      targetId: input.equipmentId,
      beforeState: { operationalStatus: current.operationalStatus, communicationProtocol: current.communicationProtocol, integrationMethod: current.integrationMethod, sensorConfiguration: current.sensorConfiguration, measurementUnits: current.measurementUnits },
      afterState: { operationalStatus: updated.operationalStatus, communicationProtocol: updated.communicationProtocol, integrationMethod: updated.integrationMethod, sensorConfiguration: updated.sensorConfiguration, measurementUnits: updated.measurementUnits },
    });
    return updated;
  });
}

export async function recordCalibration(manufacturerId: string, rawInput: unknown) {
  const parsed = calibrationRecordSchema.safeParse(rawInput);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Calibration details are invalid.');
  const input: CalibrationRecordInput = parsed.data;

  return db.transaction(async (tx) => {
    const [equipment] = await tx.select().from(industrialEquipment)
      .where(and(eq(industrialEquipment.id, input.equipmentId), eq(industrialEquipment.manufacturerId, manufacturerId)))
      .for('update')
      .limit(1);
    if (!equipment) throw new Error('Equipment not found.');

    const [calibration] = await tx.insert(industrialEquipmentCalibration).values({
      equipmentId: input.equipmentId,
      calibrationReference: input.calibrationReference,
      status: input.status,
      calibratedAt: new Date(input.calibratedAt),
      nextCalibrationAt: input.nextCalibrationAt ? new Date(input.nextCalibrationAt) : null,
      certificateReference: input.certificateReference || null,
      notes: input.notes || null,
      performedByUserId: manufacturerId,
    }).returning();
    if (!calibration) throw new Error('Calibration record could not be saved.');

    await tx.update(industrialEquipment).set({
      calibrationStatus: input.status === 'valid' ? 'valid' : input.status === 'failed' ? 'expired' : equipment.calibrationStatus,
      lastCalibrationDate: new Date(input.calibratedAt),
      nextCalibrationDate: input.nextCalibrationAt ? new Date(input.nextCalibrationAt) : null,
    }).where(eq(industrialEquipment.id, input.equipmentId));
    await tx.insert(auditLog).values({
      userId: manufacturerId,
      action: 'INDUSTRIAL_EQUIPMENT_CALIBRATION_RECORDED',
      targetType: 'industrial_equipment',
      targetId: input.equipmentId,
      beforeState: { calibrationStatus: equipment.calibrationStatus, lastCalibrationDate: equipment.lastCalibrationDate },
      afterState: { calibrationStatus: input.status, calibratedAt: input.calibratedAt, nextCalibrationAt: input.nextCalibrationAt ?? null },
      metadata: JSON.stringify({ calibrationReference: input.calibrationReference }),
    });
    return calibration;
  });
}

export async function registerGateway(manufacturerId: string, rawInput: unknown) {
  const parsed = gatewayRegistrationSchema.safeParse(rawInput);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Gateway details are invalid.');
  const input: GatewayRegistrationInput = parsed.data;
  const [ownedFactory] = await db.select({ id: factory.id }).from(factory)
    .where(and(eq(factory.id, input.factoryId), eq(factory.manufacturerId, manufacturerId))).limit(1);
  if (!ownedFactory) throw new Error('Factory not found.');

  const clientSecret = randomBytes(32).toString('base64url');
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(industrialGateway).values({
      manufacturerId,
      factoryId: input.factoryId,
      gatewayCode: input.gatewayCode,
      name: input.name,
      softwareVersion: input.softwareVersion || null,
    }).returning();
    if (!created) throw new Error('Gateway registration returned no record.');
    await tx.insert(industrialGatewayCredential).values({
      gatewayId: created.id,
      credentialType: 'api_secret',
      credentialVersion: 1,
      credentialHash: hashSecret(clientSecret),
    });
    await tx.insert(auditLog).values({
      userId: manufacturerId,
      action: 'INDUSTRIAL_GATEWAY_REGISTERED',
      targetType: 'industrial_gateway',
      targetId: created.id,
      afterState: { factoryId: created.factoryId, status: created.status },
      metadata: JSON.stringify({ gatewayCode: created.gatewayCode, credentialVersion: 1 }),
    });
    return { gateway: created, clientSecret };
  });
}

export async function listManufacturerGateways(manufacturerId: string) {
  return db.select().from(industrialGateway)
    .where(eq(industrialGateway.manufacturerId, manufacturerId))
    .orderBy(asc(industrialGateway.factoryId), asc(industrialGateway.gatewayCode));
}

export async function rotateGatewayCredential(manufacturerId: string, gatewayId: string) {
  const clientSecret = randomBytes(32).toString('base64url');
  return db.transaction(async (tx) => {
    const [gateway] = await tx.select().from(industrialGateway)
      .where(and(eq(industrialGateway.id, gatewayId), eq(industrialGateway.manufacturerId, manufacturerId)))
      .for('update')
      .limit(1);
    if (!gateway) throw new Error('Gateway not found.');
    if (gateway.status === 'revoked') throw new Error('A revoked gateway cannot rotate credentials.');
    const [latest] = await tx.select({ version: industrialGatewayCredential.credentialVersion })
      .from(industrialGatewayCredential)
      .where(eq(industrialGatewayCredential.gatewayId, gatewayId))
      .orderBy(desc(industrialGatewayCredential.credentialVersion))
      .limit(1);
    const version = (latest?.version ?? 0) + 1;
    await tx.update(industrialGatewayCredential).set({ revokedAt: new Date() })
      .where(and(eq(industrialGatewayCredential.gatewayId, gatewayId), isNull(industrialGatewayCredential.revokedAt)));
    await tx.insert(industrialGatewayCredential).values({ gatewayId, credentialType: 'api_secret', credentialVersion: version, credentialHash: hashSecret(clientSecret) });
    await tx.insert(auditLog).values({
      userId: manufacturerId,
      action: 'INDUSTRIAL_GATEWAY_CREDENTIAL_ROTATED',
      targetType: 'industrial_gateway',
      targetId: gatewayId,
      metadata: JSON.stringify({ credentialVersion: version }),
    });
    return { gatewayId, clientSecret, credentialVersion: version };
  });
}

export async function revokeGateway(manufacturerId: string, gatewayId: string) {
  return db.transaction(async (tx) => {
    const [updated] = await tx.update(industrialGateway).set({ status: 'revoked', revokedAt: new Date() })
      .where(and(eq(industrialGateway.id, gatewayId), eq(industrialGateway.manufacturerId, manufacturerId), eq(industrialGateway.status, 'active')))
      .returning();
    if (!updated) throw new Error('Only an active gateway can be revoked.');
    await tx.update(industrialGatewayCredential).set({ revokedAt: new Date() })
      .where(and(eq(industrialGatewayCredential.gatewayId, gatewayId), isNull(industrialGatewayCredential.revokedAt)));
    await tx.insert(auditLog).values({ userId: manufacturerId, action: 'INDUSTRIAL_GATEWAY_REVOKED', targetType: 'industrial_gateway', targetId: gatewayId });
    return updated;
  });
}

export async function activateGateway(actorUserId: string, gatewayId: string) {
  return db.transaction(async (tx) => {
    const [gateway] = await tx.select().from(industrialGateway).where(eq(industrialGateway.id, gatewayId)).for('update').limit(1);
    if (!gateway) throw new Error('Gateway not found.');
    if (!['pending', 'suspended'].includes(gateway.status)) throw new Error(`Gateway cannot be activated from ${gateway.status}.`);
    const [updated] = await tx.update(industrialGateway).set({ status: 'active', revokedAt: null }).where(eq(industrialGateway.id, gatewayId)).returning();
    if (!updated) throw new Error('Gateway activation failed.');
    await tx.insert(auditLog).values({ userId: actorUserId, action: 'INDUSTRIAL_GATEWAY_ACTIVATED', targetType: 'industrial_gateway', targetId: gatewayId, afterState: { status: updated.status } });
    return updated;
  });
}

async function authenticateGateway(gatewayId: string, clientSecret: string) {
  const [row] = await db.select({ gateway: industrialGateway, credential: industrialGatewayCredential })
    .from(industrialGateway)
    .innerJoin(industrialGatewayCredential, eq(industrialGatewayCredential.gatewayId, industrialGateway.id))
    .where(and(eq(industrialGateway.id, gatewayId), isNull(industrialGatewayCredential.revokedAt)))
    .orderBy(desc(industrialGatewayCredential.credentialVersion))
    .limit(1);
  if (!row || row.gateway.status !== 'active') throw new Error('Gateway authentication failed.');
  if (row.credential.expiresAt && row.credential.expiresAt <= new Date()) throw new Error('Gateway credential has expired.');
  if (!equalHash(row.credential.credentialHash, hashSecret(clientSecret))) throw new Error('Gateway authentication failed.');
  await db.update(industrialGatewayCredential).set({ lastUsedAt: new Date() }).where(eq(industrialGatewayCredential.id, row.credential.id));
  return row.gateway;
}

export async function recordGatewayHeartbeat(gatewayId: string, clientSecret: string, rawInput: unknown) {
  const gateway = await authenticateGateway(gatewayId, clientSecret);
  const input = typeof rawInput === 'object' && rawInput !== null && !Array.isArray(rawInput) ? rawInput as Record<string, unknown> : {};
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(industrialGateway).set({ lastHeartbeatAt: now, lastSyncAt: now }).where(eq(industrialGateway.id, gateway.id));
    await tx.insert(industrialGatewayConnection).values({
      gatewayId: gateway.id,
      connectionType: typeof input.connectionType === 'string' ? input.connectionType.slice(0, 80) : 'gateway_heartbeat',
      protocol: typeof input.protocol === 'string' ? input.protocol.slice(0, 80) : 'https',
      status: 'connected',
      connectedAt: now,
      lastSeenAt: now,
      metadata: { softwareVersion: input.softwareVersion ?? gateway.softwareVersion ?? null },
    });
  });
  return { gatewayId: gateway.id, acknowledgedAt: now.toISOString() };
}

export async function acknowledgeIndustrialEvents(gatewayId: string, clientSecret: string, eventIds: string[]) {
  const gateway = await authenticateGateway(gatewayId, clientSecret);
  const boundedIds = [...new Set(eventIds)].slice(0, 2_000);
  if (boundedIds.length === 0) return { gatewayId: gateway.id, acknowledged: 0 };
  const now = new Date();
  const updated = await db.update(industrialEventSync).set({ syncStatus: 'acknowledged', acknowledgedAt: now, errorMessage: null })
    .where(and(eq(industrialEventSync.gatewayId, gateway.id), inArray(industrialEventSync.eventId, boundedIds)))
    .returning({ id: industrialEventSync.id });
  await db.update(industrialGateway).set({ lastSyncAt: now }).where(eq(industrialGateway.id, gateway.id));
  return { gatewayId: gateway.id, acknowledged: updated.length, acknowledgedAt: now.toISOString() };
}

export async function getGatewayDiagnostics(gatewayId: string, clientSecret: string) {
  const gateway = await authenticateGateway(gatewayId, clientSecret);
  const [eventCount] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(industrialEvent).where(eq(industrialEvent.gatewayId, gateway.id));
  const [failedSyncCount] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(industrialEventSync).where(and(eq(industrialEventSync.gatewayId, gateway.id), eq(industrialEventSync.syncStatus, 'failed')));
  const [latestConnection] = await db.select().from(industrialGatewayConnection).where(eq(industrialGatewayConnection.gatewayId, gateway.id)).orderBy(desc(industrialGatewayConnection.lastSeenAt)).limit(1);
  return {
    gatewayId: gateway.id,
    status: gateway.status,
    lastHeartbeatAt: gateway.lastHeartbeatAt,
    lastSyncAt: gateway.lastSyncAt,
    eventCount: Number(eventCount?.count ?? 0),
    failedSyncCount: Number(failedSyncCount?.count ?? 0),
    latestConnection: latestConnection ?? null,
  };
}

export async function ingestIndustrialEvent(rawInput: unknown, clientSecret: string) {
  const parsed = industrialEventSchema.safeParse(rawInput);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Industrial event is invalid.');
  const input: IndustrialEventInput = parsed.data;
  const gateway = await authenticateGateway(input.gatewayId, clientSecret);
  return ingestAuthenticatedIndustrialEvent(gateway, input, rawInput as Record<string, unknown>);
}

export async function ingestAuthenticatedIndustrialEvent(gateway: typeof industrialGateway.$inferSelect, input: IndustrialEventInput, originalPayload: Record<string, unknown>) {
  if (input.eventTimestamp && new Date(input.eventTimestamp).getTime() > Date.now() + 5 * 60 * 1000) throw new Error('Event timestamp cannot be materially in the future.');
  if (gateway.factoryId !== input.factoryId) throw new Error('Gateway is not authorized for this factory.');
  const incomingPayloadHash = payloadHash(originalPayload);

  const [equipment] = await db.select({ id: industrialEquipment.id, manufacturerId: industrialEquipment.manufacturerId, factoryId: industrialEquipment.factoryId, productionLineId: industrialEquipment.productionLineId })
    .from(industrialEquipment)
    .where(and(eq(industrialEquipment.id, input.equipmentId), eq(industrialEquipment.manufacturerId, gateway.manufacturerId), eq(industrialEquipment.factoryId, input.factoryId), eq(industrialEquipment.productionLineId, input.lineId)))
    .limit(1);
  if (!equipment) throw new Error('Equipment is not authorized for this factory and production line.');

  let batch: { id: string; batchReference: string; manufacturerId: string; factoryId: string | null; productionLineId: string | null } | undefined;
  if (input.batchId || input.batchReference) {
    const [found] = await db.select({ id: productionBatch.id, batchReference: productionBatch.batchReference, manufacturerId: productionBatch.manufacturerId, factoryId: productionBatch.factoryId, productionLineId: productionBatch.productionLineId })
      .from(productionBatch)
      .where(input.batchId ? eq(productionBatch.id, input.batchId) : eq(productionBatch.batchReference, input.batchReference!))
      .limit(1);
    if (!found || found.manufacturerId !== gateway.manufacturerId) throw new Error('Batch is not owned by the gateway manufacturer.');
    if ((found.factoryId && found.factoryId !== input.factoryId) || (found.productionLineId && found.productionLineId !== input.lineId)) throw new Error('Batch is not associated with this factory and production line.');
    batch = found;
  }

  const existing = await db.select().from(industrialEvent)
    .where(and(eq(industrialEvent.gatewayId, gateway.id), eq(industrialEvent.eventId, input.eventId))).limit(1);
  if (existing[0]) {
    if (existing[0].payloadHash !== incomingPayloadHash) throw new Error('Duplicate event identifier has a different payload.');
    return { duplicate: true, event: existing[0], sequenceStatus: existing[0].sequenceStatus, counterStatus: existing[0].counterStatus };
  }

  const counterValue = readCounter(input.measurements);
  const now = new Date();
  const eventPayload = { ...input } as Record<string, unknown>;
  delete eventPayload.clientSecret;

  return db.transaction(async (tx) => {
    const [cursor] = await tx.select().from(industrialEventSequence)
      .where(and(eq(industrialEventSequence.gatewayId, gateway.id), eq(industrialEventSequence.equipmentId, equipment.id)))
      .for('update').limit(1);
    let sequenceStatus: 'in_order' | 'out_of_order' | 'gap' = 'in_order';
    let counterStatus: 'normal' | 'reset' | 'rollover' | 'decreased' = 'normal';
    if (cursor) {
      if (input.sequenceNumber > cursor.lastSequenceNumber + 1) sequenceStatus = 'gap';
      else if (input.sequenceNumber <= cursor.lastSequenceNumber) sequenceStatus = 'out_of_order';
      if (input.eventType === 'COUNTER_RESET') counterStatus = 'reset';
      else if (counterValue !== null && cursor.lastCounterValue !== null && counterValue < cursor.lastCounterValue) {
        counterStatus = input.sequenceNumber > cursor.lastSequenceNumber ? 'reset' : 'decreased';
      }
    } else if (input.eventType === 'COUNTER_RESET') {
      counterStatus = 'reset';
    }

    const [created] = await tx.insert(industrialEvent).values({
      eventId: input.eventId,
      manufacturerId: gateway.manufacturerId,
      gatewayId: gateway.id,
      factoryId: input.factoryId,
      productionLineId: input.lineId,
      equipmentId: input.equipmentId,
      batchId: batch?.id ?? null,
      batchReference: input.batchReference || batch?.batchReference || null,
      eventType: input.eventType,
      stageCode: input.stageCode || null,
      stageSequenceNumber: input.stageSequenceNumber ?? null,
      sequenceNumber: input.sequenceNumber,
      eventTimestamp: new Date(input.eventTimestamp),
      receivedTimestamp: now,
      measurements: input.measurements,
      unit: input.unit || null,
      source: input.source,
      schemaVersion: input.schemaVersion,
      originalPayload: originalPayload,
      normalizedPayload: eventPayload,
      payloadHash: incomingPayloadHash,
      validationStatus: 'accepted',
      integrityStatus: 'verified',
      synchronizationStatus: 'acknowledged',
      sequenceStatus,
      counterStatus,
      isSimulated: input.source === 'simulator',
    }).returning();
    if (!created) throw new Error('Industrial event could not be stored.');

    if (!cursor) {
      await tx.insert(industrialEventSequence).values({ gatewayId: gateway.id, equipmentId: equipment.id, lastSequenceNumber: input.sequenceNumber, lastCounterValue: counterValue, lastEventTimestamp: new Date(input.eventTimestamp) });
    } else if (input.sequenceNumber > cursor.lastSequenceNumber) {
      await tx.update(industrialEventSequence).set({ lastSequenceNumber: input.sequenceNumber, lastCounterValue: counterValue ?? cursor.lastCounterValue, lastEventTimestamp: new Date(input.eventTimestamp), updatedAt: now }).where(eq(industrialEventSequence.id, cursor.id));
    }

    if (batch) {
      const [evidence] = await tx.select().from(industrialBatchEvidence).where(eq(industrialBatchEvidence.batchId, batch.id)).for('update').limit(1);
      const rejectedValue = typeof input.measurements.bottlesRejected === 'number' ? input.measurements.bottlesRejected : null;
      if (!evidence) {
        await tx.insert(industrialBatchEvidence).values({
          batchId: batch.id,
          manufacturerId: gateway.manufacturerId,
          machineReportedQuantity: counterValue === null ? null : String(counterValue),
          machineRejectedQuantity: rejectedValue === null ? null : String(rejectedValue),
          lastMachineCounter: counterValue === null ? null : String(counterValue),
          eventCount: 1,
          counterResetCount: counterStatus === 'reset' ? 1 : 0,
          firstEventAt: new Date(input.eventTimestamp),
          lastEventAt: new Date(input.eventTimestamp),
        });
      } else {
        await tx.update(industrialBatchEvidence).set({
          machineReportedQuantity: counterValue === null ? evidence.machineReportedQuantity : String(counterValue),
          machineRejectedQuantity: rejectedValue === null ? evidence.machineRejectedQuantity : String(rejectedValue),
          lastMachineCounter: counterValue === null ? evidence.lastMachineCounter : String(counterValue),
          eventCount: evidence.eventCount + 1,
          counterResetCount: evidence.counterResetCount + (counterStatus === 'reset' ? 1 : 0),
          firstEventAt: evidence.firstEventAt ?? new Date(input.eventTimestamp),
          lastEventAt: new Date(input.eventTimestamp),
          updatedAt: now,
        }).where(eq(industrialBatchEvidence.id, evidence.id));
      }
      if (input.stageCode && input.stageSequenceNumber) {
        await tx.insert(industrialBatchStageHistory).values({
          batchId: batch.id,
          manufacturerId: gateway.manufacturerId,
          eventId: created.id,
          stageCode: input.stageCode,
          stageName: input.stageCode.replaceAll('_', ' ').toLowerCase(),
          sequenceNumber: input.stageSequenceNumber,
          status: input.eventType === 'QUALITY_RESULT' ? 'completed' : 'completed',
          eventTimestamp: new Date(input.eventTimestamp),
        });
      }
    }
    await tx.insert(industrialEventSync).values({ eventId: created.id, gatewayId: gateway.id, syncStatus: 'acknowledged', acknowledgedAt: now });
    await tx.update(industrialEquipment).set({ lastCommunicationAt: now }).where(eq(industrialEquipment.id, equipment.id));
    await tx.update(industrialGateway).set({ lastHeartbeatAt: now, lastSyncAt: now }).where(eq(industrialGateway.id, gateway.id));
    await tx.insert(auditLog).values({
      userId: gateway.manufacturerId,
      action: 'INDUSTRIAL_EVENT_ACCEPTED',
      targetType: 'industrial_event',
      targetId: created.id,
      metadata: JSON.stringify({ actorType: 'industrial_gateway', gatewayId: gateway.id, eventId: created.eventId, sequenceStatus, counterStatus, isSimulated: created.isSimulated }),
    });
    return { duplicate: false, event: created, sequenceStatus, counterStatus, acknowledgementId: created.id };
  });
}

export async function listIndustrialEventsForManufacturer(manufacturerId: string, limit = 100) {
  return db.select().from(industrialEvent)
    .where(eq(industrialEvent.manufacturerId, manufacturerId))
    .orderBy(desc(industrialEvent.receivedTimestamp))
    .limit(Math.min(Math.max(limit, 1), 500));
}

export async function verifyIndustrialBatch(batchId: string, tolerancePercent = 2) {
  if (!Number.isFinite(tolerancePercent) || tolerancePercent < 0 || tolerancePercent > 100) throw new Error('Verification tolerance is invalid.');
  const [batch] = await db.select({
    id: productionBatch.id,
    manufacturerId: productionBatch.manufacturerId,
    factoryId: productionBatch.factoryId,
    declaredQuantity: productionBatch.declaredQuantity,
  }).from(productionBatch).where(eq(productionBatch.id, batchId)).limit(1);
  if (!batch) throw new Error('Production batch not found.');
  if (!batch.factoryId) throw new Error('Production batch is not associated with a registered factory.');

  const [evidence] = await db.select().from(industrialBatchEvidence).where(eq(industrialBatchEvidence.batchId, batchId)).limit(1);
  const machineQuantity = evidence?.machineReportedQuantity == null ? null : Number(evidence.machineReportedQuantity);
  const declaredQuantity = Number(batch.declaredQuantity);
  const allowedVariance = Math.max(1, Math.abs(declaredQuantity) * (tolerancePercent / 100));
  const variance = machineQuantity === null ? null : machineQuantity - declaredQuantity;
  const outcome: 'matched' | 'discrepant' | 'no_machine_evidence' = machineQuantity === null
    ? 'no_machine_evidence'
    : Math.abs(variance ?? 0) <= allowedVariance ? 'matched' : 'discrepant';
  const reasonCodes = outcome === 'matched' ? [] : outcome === 'no_machine_evidence' ? ['MACHINE_EVIDENCE_MISSING'] : ['MACHINE_DECLARATION_VARIANCE'];
  const comparisonKey = createHash('sha256').update(JSON.stringify({ batchId, machineQuantity, declaredQuantity, tolerancePercent })).digest('hex');

  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(industrialVerificationResult).where(eq(industrialVerificationResult.comparisonKey, comparisonKey)).limit(1);
    if (existing) return existing;
    const [result] = await tx.insert(industrialVerificationResult).values({
      batchId,
      manufacturerId: batch.manufacturerId,
      machineQuantity: machineQuantity === null ? null : String(machineQuantity),
      declaredQuantity: String(declaredQuantity),
      varianceQuantity: variance === null ? null : String(variance),
      tolerancePercent,
      outcome,
      reasonCodes,
      comparisonKey,
    }).returning();
    if (!result) throw new Error('Verification result could not be saved.');
    if (outcome !== 'matched') {
      await tx.insert(industrialAlert).values({
        manufacturerId: batch.manufacturerId,
        factoryId: batch.factoryId,
        batchId,
        alertType: outcome === 'no_machine_evidence' ? 'MACHINE_EVIDENCE_MISSING' : 'PRODUCTION_QUANTITY_DISCREPANCY',
        severity: outcome === 'no_machine_evidence' ? 'high' : 'medium',
        status: 'open',
        summary: outcome === 'no_machine_evidence' ? 'Production batch has no machine evidence.' : 'Machine and declared production quantities differ beyond tolerance.',
        details: { machineQuantity, declaredQuantity, variance, tolerancePercent, reasonCodes },
        dedupeKey: comparisonKey,
      }).onConflictDoNothing({ target: industrialAlert.dedupeKey });
    }
    await tx.update(industrialBatchEvidence).set({ verificationStatus: outcome === 'matched' ? 'supported' : outcome === 'discrepant' ? 'discrepant' : 'insufficient_evidence', updatedAt: new Date() }).where(eq(industrialBatchEvidence.batchId, batchId));
    await tx.insert(auditLog).values({
      userId: batch.manufacturerId,
      action: 'INDUSTRIAL_BATCH_VERIFIED',
      targetType: 'production_batch',
      targetId: batchId,
      metadata: JSON.stringify({ actorType: 'verification_engine', outcome, machineQuantity, declaredQuantity, tolerancePercent }),
    });
    return result;
  });
}

export async function listIndustrialAlertsForManufacturer(manufacturerId: string, limit = 100) {
  return db.select().from(industrialAlert)
    .where(eq(industrialAlert.manufacturerId, manufacturerId))
    .orderBy(desc(industrialAlert.createdAt))
    .limit(Math.min(Math.max(limit, 1), 500));
}

export async function getIndustrialMonitoringSummary() {
  const heartbeatCutoff = new Date(Date.now() - 10 * 60 * 1000);
  const [
    factories,
    lines,
    equipment,
    gateways,
    offlineGateways,
    events,
    monitoredBatches,
    batchesAwaitingVerification,
    discrepancies,
    awaitingApproval,
  ] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)::int` }).from(factory),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(factoryProductionLine).where(eq(factoryProductionLine.operationalStatus, 'active')),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(industrialEquipment),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(industrialGateway).where(eq(industrialGateway.status, 'active')),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(industrialGateway).where(and(eq(industrialGateway.status, 'active'), sql`(${industrialGateway.lastHeartbeatAt} IS NULL OR ${industrialGateway.lastHeartbeatAt} < ${heartbeatCutoff})`)),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(industrialEvent),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(industrialBatchEvidence),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(industrialBatchEvidence).where(eq(industrialBatchEvidence.verificationStatus, 'pending')),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(industrialAlert).where(and(inArray(industrialAlert.status, ['open', 'acknowledged']), inArray(industrialAlert.alertType, ['PRODUCTION_QUANTITY_DISCREPANCY', 'MACHINE_EVIDENCE_MISSING']))),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(factory).where(inArray(factory.onboardingStatus, ['submitted', 'under_review', 'technical_assessment'])),
  ]);
  return {
    totalFactories: Number(factories[0]?.count ?? 0),
    activeProductionLines: Number(lines[0]?.count ?? 0),
    registeredEquipment: Number(equipment[0]?.count ?? 0),
    connectedGateways: Number(gateways[0]?.count ?? 0),
    offlineGateways: Number(offlineGateways[0]?.count ?? 0),
    productionEventsReceived: Number(events[0]?.count ?? 0),
    batchesMonitored: Number(monitoredBatches[0]?.count ?? 0),
    batchesAwaitingVerification: Number(batchesAwaitingVerification[0]?.count ?? 0),
    productionDiscrepancies: Number(discrepancies[0]?.count ?? 0),
    factoriesAwaitingApproval: Number(awaitingApproval[0]?.count ?? 0),
  };
}

export async function setIndustrialIntegrationPolicy(actorUserId: string, rawInput: unknown) {
  const parsed = integrationPolicySchema.safeParse(rawInput);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Integration policy is invalid.');
  const input: IntegrationPolicyInput = parsed.data;
  const [ownedFactory] = await db.select({ id: factory.id }).from(factory).where(eq(factory.id, input.factoryId)).limit(1);
  if (!ownedFactory) throw new Error('Factory not found.');
  const [policy] = await db.insert(industrialIntegrationPolicy).values({
    factoryId: input.factoryId,
    mandatory: input.mandatory,
    requiredEquipmentCount: input.requiredEquipmentCount,
    requiredGatewayCount: input.requiredGatewayCount,
    integrationTestRequired: input.integrationTestRequired,
    exceptionStatus: input.exceptionStatus,
    exceptionReason: input.exceptionReason || null,
    createdByUserId: actorUserId,
  }).onConflictDoUpdate({
    target: industrialIntegrationPolicy.factoryId,
    set: {
      mandatory: input.mandatory,
      requiredEquipmentCount: input.requiredEquipmentCount,
      requiredGatewayCount: input.requiredGatewayCount,
      integrationTestRequired: input.integrationTestRequired,
      exceptionStatus: input.exceptionStatus,
      exceptionReason: input.exceptionReason || null,
      updatedAt: new Date(),
    },
  }).returning();
  if (!policy) throw new Error('Integration policy could not be saved.');
  await db.insert(auditLog).values({ userId: actorUserId, action: 'INDUSTRIAL_INTEGRATION_POLICY_UPDATED', targetType: 'industrial_integration_policy', targetId: policy.id, metadata: JSON.stringify({ factoryId: input.factoryId, mandatory: input.mandatory }) });
  return policy;
}

export async function evaluateFactoryIntegrationCompliance(factoryId: string) {
  const [policy] = await db.select().from(industrialIntegrationPolicy).where(eq(industrialIntegrationPolicy.factoryId, factoryId)).limit(1);
  const [ownedFactory] = await db.select().from(factory).where(eq(factory.id, factoryId)).limit(1);
  if (!ownedFactory) throw new Error('Factory not found.');
  if (!policy || !policy.mandatory) return { status: 'not_required' as const, missing: [], factoryId };
  if (policy.exceptionStatus === 'approved') {
    await db.update(industrialIntegrationPolicy).set({ currentStatus: 'exception', lastEvaluatedAt: new Date(), updatedAt: new Date() }).where(eq(industrialIntegrationPolicy.id, policy.id));
    return { status: 'exception' as const, missing: [], factoryId };
  }
  const [equipmentCount] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(industrialEquipment).where(and(eq(industrialEquipment.factoryId, factoryId), inArray(industrialEquipment.operationalStatus, ['registered', 'active', 'maintenance'])));
  const [gatewayCount] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(industrialGateway).where(and(eq(industrialGateway.factoryId, factoryId), eq(industrialGateway.status, 'active')));
  const missing: string[] = [];
  if (Number(equipmentCount?.count ?? 0) < policy.requiredEquipmentCount) missing.push('REQUIRED_EQUIPMENT_NOT_REGISTERED');
  if (Number(gatewayCount?.count ?? 0) < policy.requiredGatewayCount) missing.push('REQUIRED_GATEWAY_NOT_CONNECTED');
  if (policy.integrationTestRequired && ownedFactory.integrationStatus !== 'connected') missing.push('INTEGRATION_TEST_NOT_CONNECTED');
  const status = missing.length === 0 ? 'compliant' : 'non_compliant';
  await db.update(industrialIntegrationPolicy).set({ currentStatus: status, lastEvaluatedAt: new Date(), updatedAt: new Date() }).where(eq(industrialIntegrationPolicy.id, policy.id));
  if (missing.length > 0) {
    const openIncidents = await db.select({ id: industrialComplianceIncident.id }).from(industrialComplianceIncident).where(and(eq(industrialComplianceIncident.factoryId, factoryId), eq(industrialComplianceIncident.status, 'open'))).limit(1);
    if (!openIncidents[0]) {
      await db.insert(industrialComplianceIncident).values({
        factoryId,
        manufacturerId: ownedFactory.manufacturerId,
        policyId: policy.id,
        incidentType: 'MANDATORY_INTEGRATION_NON_COMPLIANCE',
        severity: 'high',
        status: 'open',
        summary: 'Factory does not meet its mandatory industrial integration requirements.',
        details: { missing, requiredEquipmentCount: policy.requiredEquipmentCount, requiredGatewayCount: policy.requiredGatewayCount },
      });
      await db.insert(notification).values({
        userId: ownedFactory.manufacturerId,
        type: 'industrial_compliance_alert',
        title: 'Industrial integration requirement not met',
        message: 'A registered factory does not currently meet its mandatory industrial integration requirements.',
        link: '/dashboard/industrial',
      });
    }
  }
  return { status, missing, factoryId, equipmentCount: Number(equipmentCount?.count ?? 0), gatewayCount: Number(gatewayCount?.count ?? 0) };
}
