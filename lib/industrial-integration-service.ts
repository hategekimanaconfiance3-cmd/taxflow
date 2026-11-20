import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import db from '@/db/drizzle';
import { tinDb } from '@/db/tin-drizzle';
import { tinRecord } from '@/db/tin-schema';
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
  industrialGatewayRequestNonce,
  industrialCredentialDelivery,
  industrialIntegration,
  industrialIntegrationEquipment,
  industrialIntegrationRequest,
  industrialIntegrationPolicy,
  industrialVerificationResult,
  notification,
  productionBatch,
  rraStaff,
  rraStaffJurisdiction,
  rraStaffRole,
  user,
} from '@/db/schema';
import {
  calibrationRecordSchema,
  equipmentRegistrationSchema,
  equipmentUpdateSchema,
  industrialIntegrationActionSchema,
  industrialIntegrationRequestSchema,
  industrialIntegrationReviewSchema,
  industrialEventSchema,
  integrationPolicySchema,
  type CalibrationRecordInput,
  type EquipmentRegistrationInput,
  type EquipmentUpdateInput,
  type IndustrialIntegrationActionInput,
  type IndustrialIntegrationRequestInput,
  type IndustrialIntegrationReviewInput,
  type IndustrialEventInput,
  type IntegrationPolicyInput,
} from '@/lib/validation/manufacturing-integration.schema';
import { consumeRateLimit } from '@/lib/rate-limit';
import {
  createGatewayCode,
  createIntegrationCode,
  decryptCredentialEnvelope,
  encryptCredentialEnvelope,
  generateGatewaySigningKey,
  hashSecret as hashIndustrialSecret,
  isTimestampFresh,
  verifyGatewaySignature,
  type GatewayRequestSecurity,
} from '@/lib/industrial-security';

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

type TaxflowTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbExecutor = typeof db | TaxflowTransaction;

async function assertOfficerFactoryJurisdiction(actorUserId: string, factoryId: string, executor: DbExecutor = db): Promise<void> {
  const [staff] = await executor.select({ id: rraStaff.id, clearanceLevel: rraStaff.clearanceLevel }).from(rraStaff)
    .where(and(eq(rraStaff.userId, actorUserId), eq(rraStaff.isActive, true))).limit(1);
  if (!staff) throw new Error('Active TF officer record not found.');
  const roles = await executor.select({ role: rraStaffRole.role }).from(rraStaffRole).where(eq(rraStaffRole.staffRecordId, staff.id));
  if (staff.clearanceLevel === 'super_admin' || roles.some((row) => row.role === 'super_admin')) return;
  const [targetFactory] = await executor.select({ manufacturerId: factory.manufacturerId }).from(factory).where(eq(factory.id, factoryId)).limit(1);
  if (!targetFactory) throw new Error('Factory not found.');
  const [manufacturer] = await executor.select({ tinNumber: user.tinNumber }).from(user).where(eq(user.id, targetFactory.manufacturerId)).limit(1);
  if (!manufacturer?.tinNumber) throw new Error('Factory jurisdiction could not be resolved.');
  const [location] = await tinDb.select({ province: tinRecord.province, district: tinRecord.district }).from(tinRecord).where(eq(tinRecord.tinNumber, manufacturer.tinNumber)).limit(1);
  if (!location?.province) throw new Error('Factory jurisdiction could not be resolved.');
  const scopes = await executor.select({ scopeType: rraStaffJurisdiction.scopeType, province: rraStaffJurisdiction.province, district: rraStaffJurisdiction.district })
    .from(rraStaffJurisdiction).where(eq(rraStaffJurisdiction.staffRecordId, staff.id));
  const allowed = scopes.some((scope) => scope.scopeType === 'national'
    || (scope.scopeType === 'province' && scope.province === location.province)
    || (scope.scopeType === 'district' && scope.province === location.province && scope.district === location.district));
  if (!allowed) throw new Error('Officer is not assigned to this factory jurisdiction.');
}

async function notifyIntegrationUser(executor: DbExecutor, userId: string, type: string, title: string, message: string, link: string) {
  await executor.insert(notification).values({ userId, type, title, message, link });
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
  void manufacturerId;
  void rawInput;
  throw new Error('Legacy gateway registration is disabled. Submit a TF-managed integration request instead.');
}

export async function listManufacturerGateways(manufacturerId: string) {
  return db.select().from(industrialGateway)
    .where(eq(industrialGateway.manufacturerId, manufacturerId))
    .orderBy(asc(industrialGateway.factoryId), asc(industrialGateway.gatewayCode));
}

export async function rotateGatewayCredential(manufacturerId: string, gatewayId: string) {
  void manufacturerId;
  void gatewayId;
  throw new Error('Legacy gateway credential rotation is disabled. Request a TF-managed integration credential instead.');
}

export async function revokeGateway(manufacturerId: string, gatewayId: string) {
  void manufacturerId;
  void gatewayId;
  throw new Error('Gateway revocation is controlled by TF through the integration lifecycle.');
}

export async function activateGateway(actorUserId: string, gatewayId: string) {
  return db.transaction(async (tx) => {
    const [gateway] = await tx.select().from(industrialGateway).where(eq(industrialGateway.id, gatewayId)).for('update').limit(1);
    if (!gateway) throw new Error('Gateway not found.');
    await assertOfficerFactoryJurisdiction(actorUserId, gateway.factoryId, tx);
    if (!['pending', 'suspended'].includes(gateway.status)) throw new Error(`Gateway cannot be activated from ${gateway.status}.`);
    if (!gateway.integrationId) throw new Error('Legacy gateways must be replaced by a TF-approved integration before activation.');
    const [integration] = await tx.select().from(industrialIntegration).where(eq(industrialIntegration.id, gateway.integrationId)).for('update').limit(1);
    if (!integration || integration.status !== 'provisioned' || integration.requiresCredentialReissue) throw new Error('Integration is not provisioned for activation.');
    const [ownedFactory] = await tx.select().from(factory).where(eq(factory.id, gateway.factoryId)).for('update').limit(1);
    if (!ownedFactory || !['approved', 'active'].includes(ownedFactory.onboardingStatus) || ownedFactory.verificationStatus !== 'verified') {
      throw new Error('Factory approval and verification are required before gateway activation.');
    }
    const authorizedEquipment = await tx.select({ id: industrialIntegrationEquipment.id })
      .from(industrialIntegrationEquipment)
      .innerJoin(industrialEquipment, eq(industrialEquipment.id, industrialIntegrationEquipment.equipmentId))
      .where(and(
        eq(industrialIntegrationEquipment.integrationId, integration.id),
        eq(industrialIntegrationEquipment.authorizationStatus, 'authorized'),
        isNull(industrialIntegrationEquipment.revokedAt),
        inArray(industrialEquipment.operationalStatus, ['registered', 'active', 'maintenance']),
      ));
    if (authorizedEquipment.length === 0) throw new Error('At least one operational authorized equipment record is required.');
    const [updated] = await tx.update(industrialGateway).set({ status: 'active', revokedAt: null }).where(eq(industrialGateway.id, gatewayId)).returning();
    if (!updated) throw new Error('Gateway activation failed.');
    await tx.update(industrialIntegration).set({ status: 'active', activatedAt: new Date(), suspendedAt: null }).where(eq(industrialIntegration.id, integration.id));
    await tx.insert(auditLog).values({ userId: actorUserId, action: 'INDUSTRIAL_GATEWAY_ACTIVATED', targetType: 'industrial_gateway', targetId: gatewayId, afterState: { status: updated.status } });
    await tx.insert(auditLog).values({ userId: actorUserId, action: 'INDUSTRIAL_INTEGRATION_ACTIVATED', targetType: 'industrial_integration', targetId: integration.id, afterState: { status: 'active', gatewayId } });
    await notifyIntegrationUser(tx, integration.manufacturerId, 'industrial_integration_activated', 'Industrial integration activated', 'Your TF-managed industrial integration is active and ready for authenticated gateway traffic.', '/dashboard/industrial');
    return updated;
  });
}

export async function requestIndustrialIntegration(manufacturerId: string, rawInput: unknown) {
  const parsed = industrialIntegrationRequestSchema.safeParse(rawInput);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Integration request is invalid.');
  const input: IndustrialIntegrationRequestInput = parsed.data;
  const requestedEquipmentIds = [...new Set(input.requestedEquipmentIds)];
  const [ownedFactory] = await db.select().from(factory).where(and(eq(factory.id, input.factoryId), eq(factory.manufacturerId, manufacturerId))).limit(1);
  if (!ownedFactory) throw new Error('Factory not found.');
  const equipment = await db.select({ id: industrialEquipment.id }).from(industrialEquipment).where(and(
    eq(industrialEquipment.manufacturerId, manufacturerId),
    eq(industrialEquipment.factoryId, input.factoryId),
    inArray(industrialEquipment.id, requestedEquipmentIds),
    sql`${industrialEquipment.operationalStatus} <> 'removed'`,
  ));
  if (equipment.length !== requestedEquipmentIds.length) throw new Error('Every requested equipment record must belong to the selected factory and manufacturer.');

  return db.transaction(async (tx) => {
    const values = {
      manufacturerId,
      factoryId: input.factoryId,
      environment: input.environment,
      integrationName: input.integrationName,
      requestedEquipmentIds,
      gatewayName: input.gatewayName ?? null,
      notes: input.notes ?? null,
      clientRequestId: input.clientRequestId ?? null,
    };
    const [created] = input.clientRequestId
      ? await tx.insert(industrialIntegrationRequest).values(values)
        .onConflictDoNothing({ target: [industrialIntegrationRequest.manufacturerId, industrialIntegrationRequest.clientRequestId] }).returning()
      : await tx.insert(industrialIntegrationRequest).values(values).returning();
    if (!created && input.clientRequestId) {
      const [existing] = await tx.select().from(industrialIntegrationRequest).where(and(eq(industrialIntegrationRequest.manufacturerId, manufacturerId), eq(industrialIntegrationRequest.clientRequestId, input.clientRequestId))).limit(1);
      if (existing) return existing;
    }
    if (!created) throw new Error('Integration request could not be created.');
    await tx.insert(auditLog).values({
      userId: manufacturerId,
      action: 'INDUSTRIAL_INTEGRATION_REQUESTED',
      targetType: 'industrial_integration_request',
      targetId: created.id,
      afterState: { factoryId: created.factoryId, environment: created.environment, status: created.status },
      metadata: JSON.stringify({ requestedEquipmentCount: requestedEquipmentIds.length }),
    });
    return created;
  });
}

export async function listManufacturerIntegrationRequests(manufacturerId: string) {
  return db.select().from(industrialIntegrationRequest)
    .where(eq(industrialIntegrationRequest.manufacturerId, manufacturerId))
    .orderBy(desc(industrialIntegrationRequest.createdAt));
}

export async function listManufacturerIntegrations(manufacturerId: string) {
  return db.select({ integration: industrialIntegration, gateway: industrialGateway })
    .from(industrialIntegration)
    .leftJoin(industrialGateway, eq(industrialGateway.integrationId, industrialIntegration.id))
    .where(eq(industrialIntegration.manufacturerId, manufacturerId))
    .orderBy(desc(industrialIntegration.createdAt));
}

export async function getManufacturerIntegration(manufacturerId: string, integrationId: string) {
  const [row] = await db.select({ integration: industrialIntegration, gateway: industrialGateway })
    .from(industrialIntegration)
    .leftJoin(industrialGateway, eq(industrialGateway.integrationId, industrialIntegration.id))
    .where(and(eq(industrialIntegration.id, integrationId), eq(industrialIntegration.manufacturerId, manufacturerId)))
    .limit(1);
  if (!row) throw new Error('Integration not found.');
  return row;
}

async function loadIntegrationMonitoring(row: Awaited<ReturnType<typeof getManufacturerIntegration>>, integrationId: string) {
  if (!row.gateway) throw new Error('Integration gateway has not been provisioned.');
  const [events, synchronizationErrors, connections, credentials, deliveries] = await Promise.all([
    db.select({ event: industrialEvent }).from(industrialEvent).where(eq(industrialEvent.gatewayId, row.gateway.id)).orderBy(desc(industrialEvent.receivedTimestamp)).limit(100),
    db.select({ sync: industrialEventSync, eventId: industrialEvent.eventId }).from(industrialEventSync).innerJoin(industrialEvent, eq(industrialEvent.id, industrialEventSync.eventId)).where(and(eq(industrialEventSync.gatewayId, row.gateway.id), eq(industrialEventSync.syncStatus, 'failed'))).orderBy(desc(industrialEventSync.createdAt)).limit(100),
    db.select().from(industrialGatewayConnection).where(eq(industrialGatewayConnection.gatewayId, row.gateway.id)).orderBy(desc(industrialGatewayConnection.lastSeenAt)).limit(20),
    db.select({ id: industrialGatewayCredential.id, credentialVersion: industrialGatewayCredential.credentialVersion, publicFingerprint: industrialGatewayCredential.publicFingerprint, issuanceReason: industrialGatewayCredential.issuanceReason, issuedAt: industrialGatewayCredential.issuedAt, expiresAt: industrialGatewayCredential.expiresAt, revokedAt: industrialGatewayCredential.revokedAt, lastUsedAt: industrialGatewayCredential.lastUsedAt }).from(industrialGatewayCredential).where(eq(industrialGatewayCredential.gatewayId, row.gateway.id)).orderBy(desc(industrialGatewayCredential.credentialVersion)),
    db.select({ id: industrialCredentialDelivery.id, expiresAt: industrialCredentialDelivery.expiresAt, claimedAt: industrialCredentialDelivery.claimedAt, createdAt: industrialCredentialDelivery.createdAt }).from(industrialCredentialDelivery).where(eq(industrialCredentialDelivery.integrationId, integrationId)).orderBy(desc(industrialCredentialDelivery.createdAt)),
  ]);
  return { integration: row.integration, gateway: row.gateway, events, synchronizationErrors, connections, credentials, deliveries };
}

export async function getManufacturerIntegrationMonitoring(manufacturerId: string, integrationId: string) {
  return loadIntegrationMonitoring(await getManufacturerIntegration(manufacturerId, integrationId), integrationId);
}

export async function testManufacturerIntegrationConnectivity(manufacturerId: string, integrationId: string) {
  const row = await getManufacturerIntegration(manufacturerId, integrationId);
  if (!row.gateway) throw new Error('Integration gateway has not been provisioned.');
  if (row.integration.status === 'suspended' || row.integration.status === 'revoked') throw new Error('Connectivity testing is disabled for this integration lifecycle state.');
  const checkedAt = new Date();
  const fresh = row.gateway.lastHeartbeatAt !== null && checkedAt.getTime() - new Date(row.gateway.lastHeartbeatAt).getTime() <= 10 * 60 * 1_000;
  return { integrationId, gatewayId: row.gateway.id, integrationStatus: row.integration.status, gatewayStatus: row.gateway.status, connected: row.gateway.status === 'active' && fresh, lastHeartbeatAt: row.gateway.lastHeartbeatAt, checkedAt: checkedAt.toISOString(), message: row.gateway.status !== 'active' ? 'Gateway is not active.' : fresh ? 'Recent authenticated gateway heartbeat received.' : 'No recent authenticated gateway heartbeat received.' };
}

export async function listIndustrialIntegrationsForOfficer(actorUserId: string) {
  const rows = await db.select({ integration: industrialIntegration, gateway: industrialGateway, factory, manufacturerId: user.id, manufacturerName: user.name, manufacturerTin: user.tinNumber })
    .from(industrialIntegration).innerJoin(factory, eq(factory.id, industrialIntegration.factoryId)).innerJoin(user, eq(user.id, industrialIntegration.manufacturerId)).leftJoin(industrialGateway, eq(industrialGateway.integrationId, industrialIntegration.id)).orderBy(desc(industrialIntegration.createdAt));
  const visible = [] as typeof rows;
  for (const row of rows) { try { await assertOfficerFactoryJurisdiction(actorUserId, row.factory.id); visible.push(row); } catch { /* hide outside jurisdiction */ } }
  const ids = visible.map((row) => row.integration.id);
  if (ids.length === 0) return [];
  const equipment = await db.select({ integrationId: industrialIntegrationEquipment.integrationId, id: industrialEquipment.id, equipmentCode: industrialEquipment.equipmentCode, name: industrialEquipment.name, operationalStatus: industrialEquipment.operationalStatus, authorizationStatus: industrialIntegrationEquipment.authorizationStatus }).from(industrialIntegrationEquipment).innerJoin(industrialEquipment, eq(industrialEquipment.id, industrialIntegrationEquipment.equipmentId)).where(inArray(industrialIntegrationEquipment.integrationId, ids));
  const byIntegration = new Map<string, typeof equipment>();
  for (const item of equipment) byIntegration.set(item.integrationId, [...(byIntegration.get(item.integrationId) ?? []), item]);
  return visible.map((row) => ({ ...row, authorizedEquipment: byIntegration.get(row.integration.id) ?? [] }));
}

export async function getIndustrialIntegrationMonitoringForOfficer(actorUserId: string, integrationId: string) {
  return loadIntegrationMonitoring(await getIndustrialIntegrationByIdForOfficer(actorUserId, integrationId), integrationId);
}

export async function listIndustrialIntegrationRequestsForOfficer(actorUserId: string) {
  const rows = await db.select({ request: industrialIntegrationRequest, factory: factory })
    .from(industrialIntegrationRequest)
    .innerJoin(factory, eq(factory.id, industrialIntegrationRequest.factoryId))
    .orderBy(desc(industrialIntegrationRequest.createdAt));
  const visibleRows = [] as typeof rows;
  for (const row of rows) { try { await assertOfficerFactoryJurisdiction(actorUserId, row.factory.id); visibleRows.push(row); } catch { /* hide outside jurisdiction */ } }
  const equipmentIds = [...new Set(visibleRows.flatMap((row) => row.request.requestedEquipmentIds))];
  if (equipmentIds.length === 0) return visibleRows.map((row) => ({ ...row, equipment: [] as Array<{ id: string; equipmentCode: string; name: string; operationalStatus: string }> }));
  const equipment = await db.select({ id: industrialEquipment.id, equipmentCode: industrialEquipment.equipmentCode, name: industrialEquipment.name, operationalStatus: industrialEquipment.operationalStatus })
    .from(industrialEquipment).where(inArray(industrialEquipment.id, equipmentIds));
  const byId = new Map(equipment.map((item) => [item.id, item]));
  return visibleRows.map((row) => ({ ...row, equipment: row.request.requestedEquipmentIds.map((id) => byId.get(id)).filter((item): item is typeof equipment[number] => Boolean(item)) }));
}

export async function getIndustrialIntegrationByIdForOfficer(actorUserId: string, integrationId: string) {
  const [row] = await db.select({ integration: industrialIntegration, gateway: industrialGateway, factory })
    .from(industrialIntegration)
    .innerJoin(factory, eq(factory.id, industrialIntegration.factoryId))
    .leftJoin(industrialGateway, eq(industrialGateway.integrationId, industrialIntegration.id))
    .where(eq(industrialIntegration.id, integrationId))
    .limit(1);
  if (!row) throw new Error('Integration not found.');
  await assertOfficerFactoryJurisdiction(actorUserId, row.factory.id);
  return row;
}

function parseRequestedCredential(value: string): { clientSecret: string; privateSigningKey: string; publicSigningKey: string; credentialVersion: number; gatewayId: string; integrationCode: string; environment: string } {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('Credential delivery payload is invalid.');
  const record = parsed as Record<string, unknown>;
  if (typeof record.clientSecret !== 'string' || typeof record.privateSigningKey !== 'string' || typeof record.publicSigningKey !== 'string' || typeof record.credentialVersion !== 'number' || typeof record.gatewayId !== 'string' || typeof record.integrationCode !== 'string' || typeof record.environment !== 'string') {
    throw new Error('Credential delivery payload is incomplete.');
  }
  return {
    clientSecret: record.clientSecret,
    privateSigningKey: record.privateSigningKey,
    publicSigningKey: record.publicSigningKey,
    credentialVersion: record.credentialVersion,
    gatewayId: record.gatewayId,
    integrationCode: record.integrationCode,
    environment: record.environment,
  };
}

export async function claimIndustrialIntegrationCredentials(manufacturerId: string, integrationId: string) {
  return db.transaction(async (tx) => {
    const [integration] = await tx.select().from(industrialIntegration).where(and(eq(industrialIntegration.id, integrationId), eq(industrialIntegration.manufacturerId, manufacturerId))).for('update').limit(1);
    if (!integration) throw new Error('Integration not found.');
    if (integration.status === 'suspended' || integration.status === 'revoked') throw new Error('Configuration package access is disabled for this integration.');
    if (!['provisioning', 'provisioned', 'active'].includes(integration.status)) throw new Error('Integration is not ready for configuration access.');
    const [delivery] = await tx.select().from(industrialCredentialDelivery).where(and(eq(industrialCredentialDelivery.integrationId, integrationId), isNull(industrialCredentialDelivery.claimedAt))).orderBy(desc(industrialCredentialDelivery.createdAt)).for('update').limit(1);
    if (!delivery) throw new Error('No unclaimed credentials are available.');
    if (delivery.expiresAt <= new Date()) throw new Error('Credential delivery has expired; request a credential rotation.');
    const payload = parseRequestedCredential(decryptCredentialEnvelope({ ciphertext: delivery.ciphertext, nonce: delivery.nonce, authTag: delivery.authTag, keyVersion: delivery.encryptionKeyVersion }));
    const [claimed] = await tx.update(industrialCredentialDelivery).set({ claimedAt: new Date(), claimedByUserId: manufacturerId }).where(and(eq(industrialCredentialDelivery.id, delivery.id), isNull(industrialCredentialDelivery.claimedAt))).returning({ id: industrialCredentialDelivery.id });
    if (!claimed) throw new Error('Credential delivery could not be claimed.');
    await tx.update(industrialIntegration).set({ requiresCredentialReissue: false, status: integration.status === 'provisioning' ? 'provisioned' : integration.status }).where(eq(industrialIntegration.id, integrationId));
    await tx.insert(auditLog).values({ userId: manufacturerId, action: 'INDUSTRIAL_CREDENTIALS_CLAIMED', targetType: 'industrial_integration', targetId: integrationId, metadata: JSON.stringify({ credentialVersion: payload.credentialVersion }) });
    return { ...payload, claimedAt: new Date().toISOString() };
  });
}

export async function getIndustrialIntegrationPackage(manufacturerId: string, integrationId: string) {
  const row = await getManufacturerIntegration(manufacturerId, integrationId);
  if (row.integration.status === 'suspended' || row.integration.status === 'revoked') throw new Error('Configuration package access is disabled for this integration.');
  if (!['provisioning', 'provisioned', 'active'].includes(row.integration.status)) throw new Error('Integration is not ready for configuration access.');
  if (!row.gateway) throw new Error('Integration gateway has not been provisioned.');
  const configuredBaseUrl = process.env.TAXFLOW_PUBLIC_BASE_URL || process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!configuredBaseUrl) throw new Error('A public TaxFlow application URL is required to build the integration package.');
  const baseUrl = configuredBaseUrl.replace(/\/$/, '');
  return {
    integrationId: row.integration.id,
    factoryId: row.integration.factoryId,
    integrationCode: row.integration.integrationCode,
    gatewayId: row.gateway.id,
    gatewayCode: row.gateway.gatewayCode,
    environment: row.integration.environment,
    authMode: row.integration.authMode,
    api: {
      events: `${baseUrl}/api/v1/industrial/events`,
      heartbeat: `${baseUrl}/api/v1/industrial/heartbeat`,
      diagnostics: `${baseUrl}/api/v1/industrial/diagnostics`,
      acknowledgements: `${baseUrl}/api/v1/industrial/sync/acknowledge`,
    },
    authentication: { scheme: 'Bearer secret plus Ed25519 request signature', secretDelivery: 'Secrets are delivered only through the one-time claim response and never in this package.', requiredHeaders: ['Authorization: Bearer <clientSecret>', 'X-TF-Timestamp', 'X-TF-Nonce', 'X-TF-Key-Version', 'X-TF-Signature-Version', 'X-TF-Signature'] },
    signing: { algorithm: 'Ed25519', signatureVersion: 'v1', timestampToleranceSeconds: 300, canonicalRequest: 'METHOD\nPATH\nTIMESTAMP\nNONCE\nKEY_VERSION\nSHA256(RAW_BODY)' },
    retry: { strategy: 'Exponential backoff with jitter for 429 and 5xx responses.', replayProtection: 'Use a fresh nonce and current Unix timestamp for every request.' },
    configurationTemplate: { integrationCode: row.integration.integrationCode, environment: row.integration.environment, gatewayId: row.gateway.id, gatewayCode: row.gateway.gatewayCode, apiBaseUrl: baseUrl, clientSecret: '<one-time-claim-secret>', privateSigningKey: '<one-time-claim-private-key>', credentialVersion: '<one-time-claim-version>' },
  };
}

export async function rotateIndustrialIntegrationCredential(manufacturerId: string, integrationId: string) {
  const clientSecret = randomBytes(32).toString('base64url');
  const signingKey = generateGatewaySigningKey();
  return db.transaction(async (tx) => {
    const [integration] = await tx.select().from(industrialIntegration).where(and(eq(industrialIntegration.id, integrationId), eq(industrialIntegration.manufacturerId, manufacturerId))).for('update').limit(1);
    if (!integration || integration.status === 'revoked') throw new Error('Integration cannot rotate credentials in its current state.');
    const [gateway] = await tx.select().from(industrialGateway).where(eq(industrialGateway.integrationId, integrationId)).for('update').limit(1);
    if (!gateway) throw new Error('Integration gateway not found.');
    const [latest] = await tx.select({ version: industrialGatewayCredential.credentialVersion }).from(industrialGatewayCredential).where(eq(industrialGatewayCredential.gatewayId, gateway.id)).orderBy(desc(industrialGatewayCredential.credentialVersion)).limit(1);
    const version = (latest?.version ?? 0) + 1;
    await tx.update(industrialGatewayCredential).set({ revokedAt: new Date() }).where(and(eq(industrialGatewayCredential.gatewayId, gateway.id), isNull(industrialGatewayCredential.revokedAt)));
    const [credential] = await tx.insert(industrialGatewayCredential).values({ gatewayId: gateway.id, credentialType: 'api_secret', credentialVersion: version, credentialHash: hashIndustrialSecret(clientSecret), publicFingerprint: signingKey.fingerprint, publicSigningKey: signingKey.publicKey, signingAlgorithm: 'ed25519', issuanceReason: 'rotation' }).returning();
    if (!credential) throw new Error('Credential rotation failed.');
    const delivery = encryptCredentialEnvelope(JSON.stringify({ clientSecret, privateSigningKey: signingKey.privateKey, publicSigningKey: signingKey.publicKey, credentialVersion: version, gatewayId: gateway.id, integrationCode: integration.integrationCode, environment: integration.environment }));
    await tx.insert(industrialCredentialDelivery).values({ integrationId, credentialId: credential.id, ciphertext: delivery.ciphertext, nonce: delivery.nonce, authTag: delivery.authTag, encryptionKeyVersion: delivery.keyVersion, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000) });
    await tx.update(industrialIntegration).set({ requiresCredentialReissue: true }).where(eq(industrialIntegration.id, integrationId));
    await tx.insert(auditLog).values({ userId: manufacturerId, action: 'INDUSTRIAL_INTEGRATION_CREDENTIAL_ROTATED', targetType: 'industrial_integration', targetId: integrationId, metadata: JSON.stringify({ credentialVersion: version }) });
    await notifyIntegrationUser(tx, manufacturerId, 'industrial_integration_credentials_rotated', 'Industrial integration credentials rotated', 'A new one-time credential delivery is ready. Claim it before it expires, then update your gateway configuration.', '/dashboard/industrial');
    return { integrationId, credentialVersion: version, deliveryExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString() };
  });
}

export async function reviewIndustrialIntegrationRequest(actorUserId: string, rawInput: unknown) {
  const parsed = industrialIntegrationReviewSchema.safeParse(rawInput);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Integration review is invalid.');
  const input: IndustrialIntegrationReviewInput = parsed.data;
  return db.transaction(async (tx) => {
    const [request] = await tx.select().from(industrialIntegrationRequest).where(eq(industrialIntegrationRequest.id, input.requestId)).for('update').limit(1);
    if (!request) throw new Error('Integration request not found.');
    await assertOfficerFactoryJurisdiction(actorUserId, request.factoryId, tx);
    const [existing] = await tx.select().from(industrialIntegration).where(eq(industrialIntegration.requestId, request.id)).limit(1);
    if (existing) return { request, integration: existing };
    if (input.decision === 'under_review' || input.decision === 'rejected') {
      const status = input.decision === 'under_review' ? 'under_review' : 'rejected';
      const [reviewed] = await tx.update(industrialIntegrationRequest).set({ status, reviewedByUserId: actorUserId, reviewedAt: new Date(), reviewNote: input.note }).where(eq(industrialIntegrationRequest.id, request.id)).returning();
      if (!reviewed) throw new Error('Integration review could not be saved.');
      await tx.insert(auditLog).values({ userId: actorUserId, action: input.decision === 'under_review' ? 'INDUSTRIAL_INTEGRATION_UNDER_REVIEW' : 'INDUSTRIAL_INTEGRATION_REJECTED', targetType: 'industrial_integration_request', targetId: request.id, beforeState: { status: request.status }, afterState: { status: reviewed.status }, metadata: JSON.stringify({ note: input.note }) });
      await notifyIntegrationUser(tx, request.manufacturerId, input.decision === 'under_review' ? 'industrial_integration_under_review' : 'industrial_integration_rejected', input.decision === 'under_review' ? 'Industrial integration request under review' : 'Industrial integration request rejected', input.decision === 'under_review' ? `TF is reviewing the ${request.integrationName} integration request.` : `TF rejected the ${request.integrationName} integration request. Review the officer note for details.`, '/dashboard/industrial');
      return { request: reviewed, integration: null };
    }
    const [ownedFactory] = await tx.select().from(factory).where(and(eq(factory.id, request.factoryId), eq(factory.manufacturerId, request.manufacturerId))).for('update').limit(1);
    if (!ownedFactory || !['approved', 'active'].includes(ownedFactory.onboardingStatus) || ownedFactory.verificationStatus !== 'verified') throw new Error('The factory must be TF-approved and verified before integration provisioning.');
    const environment: 'sandbox' | 'production' = request.environment === 'sandbox' ? 'sandbox' : request.environment === 'production' ? 'production' : (() => { throw new Error('Integration environment is invalid.'); })();
    const requestedIds = new Set(request.requestedEquipmentIds);
    const authorizedIds = input.authorizedEquipmentIds.length > 0 ? input.authorizedEquipmentIds : [...requestedIds];
    if (authorizedIds.some((id) => !requestedIds.has(id))) throw new Error('Authorized equipment must be part of the original request.');
    const equipment = await tx.select().from(industrialEquipment).where(and(eq(industrialEquipment.manufacturerId, request.manufacturerId), eq(industrialEquipment.factoryId, request.factoryId), inArray(industrialEquipment.id, authorizedIds), sql`${industrialEquipment.operationalStatus} <> 'removed'`));
    if (equipment.length !== authorizedIds.length || authorizedIds.length === 0) throw new Error('All authorized equipment must belong to the approved factory and remain operational.');

    const clientSecret = randomBytes(32).toString('base64url');
    const signingKey = generateGatewaySigningKey();
    const integrationCode = createIntegrationCode(ownedFactory.factoryCode, environment);
    const gatewayCode = createGatewayCode();
    const [createdIntegration] = await tx.insert(industrialIntegration).values({ requestId: request.id, manufacturerId: request.manufacturerId, factoryId: request.factoryId, integrationCode, environment, status: 'provisioning', authMode: 'signed_ed25519' }).returning();
    if (!createdIntegration) throw new Error('Integration provisioning could not be created.');
    const [gateway] = await tx.insert(industrialGateway).values({ manufacturerId: request.manufacturerId, factoryId: request.factoryId, integrationId: createdIntegration.id, environment, authMode: 'signed_ed25519', sourceType: 'manufacturer_gateway', gatewayCode, name: request.gatewayName ?? `${request.integrationName} gateway`, status: 'pending' }).returning();
    if (!gateway) throw new Error('Integration gateway could not be provisioned.');
    const [credential] = await tx.insert(industrialGatewayCredential).values({ gatewayId: gateway.id, credentialType: 'api_secret', credentialVersion: 1, credentialHash: hashIndustrialSecret(clientSecret), publicFingerprint: signingKey.fingerprint, publicSigningKey: signingKey.publicKey, signingAlgorithm: 'ed25519', issuanceReason: 'initial_provisioning' }).returning();
    if (!credential) throw new Error('Integration credential could not be provisioned.');
    const delivery = encryptCredentialEnvelope(JSON.stringify({ clientSecret, privateSigningKey: signingKey.privateKey, publicSigningKey: signingKey.publicKey, credentialVersion: 1, gatewayId: gateway.id, integrationCode, environment }));
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);
    await tx.insert(industrialCredentialDelivery).values({ integrationId: createdIntegration.id, credentialId: credential.id, ciphertext: delivery.ciphertext, nonce: delivery.nonce, authTag: delivery.authTag, encryptionKeyVersion: delivery.keyVersion, expiresAt });
    await tx.insert(industrialIntegrationEquipment).values(equipment.map((item) => ({ integrationId: createdIntegration.id, equipmentId: item.id, manufacturerId: request.manufacturerId, factoryId: request.factoryId, authorizationStatus: 'authorized', authorizedByUserId: actorUserId, authorizedAt: new Date() })));
    const [updatedRequest] = await tx.update(industrialIntegrationRequest).set({ status: 'approved', reviewedByUserId: actorUserId, reviewedAt: new Date(), reviewNote: input.note }).where(eq(industrialIntegrationRequest.id, request.id)).returning();
    await tx.update(factory).set({ integrationStatus: 'pending' }).where(eq(factory.id, request.factoryId));
    await tx.insert(auditLog).values({ userId: actorUserId, action: 'INDUSTRIAL_INTEGRATION_APPROVED_AND_PROVISIONED', targetType: 'industrial_integration', targetId: createdIntegration.id, afterState: { status: createdIntegration.status, gatewayId: gateway.id, factoryId: request.factoryId, environment: request.environment }, metadata: JSON.stringify({ equipmentCount: equipment.length, credentialVersion: 1, deliveryExpiresAt: expiresAt.toISOString() }) });
    await notifyIntegrationUser(tx, request.manufacturerId, 'industrial_integration_credentials_ready', 'Industrial integration approved', `TF approved ${request.integrationName}. Claim the one-time credentials before delivery expires.`, '/dashboard/industrial');
    return { request: updatedRequest, integration: createdIntegration, gateway: { id: gateway.id, gatewayCode: gateway.gatewayCode, status: gateway.status }, credentialVersion: 1, deliveryExpiresAt: expiresAt.toISOString() };
  });
}

export async function suspendIndustrialIntegration(actorUserId: string, rawInput: unknown) {
  const parsed = industrialIntegrationActionSchema.safeParse(rawInput);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Integration suspension is invalid.');
  const input: IndustrialIntegrationActionInput = parsed.data;
  return db.transaction(async (tx) => {
    const [integration] = await tx.select().from(industrialIntegration).where(eq(industrialIntegration.id, input.integrationId)).for('update').limit(1);
    if (!integration || integration.status === 'revoked') throw new Error('Integration cannot be suspended.');
    await assertOfficerFactoryJurisdiction(actorUserId, integration.factoryId, tx);
    await tx.update(industrialGateway).set({ status: 'suspended' }).where(and(eq(industrialGateway.integrationId, integration.id), sql`${industrialGateway.status} <> 'revoked'`));
    await tx.update(industrialGatewayCredential).set({ revokedAt: new Date() }).where(and(inArray(industrialGatewayCredential.gatewayId, db.select({ id: industrialGateway.id }).from(industrialGateway).where(eq(industrialGateway.integrationId, integration.id))), isNull(industrialGatewayCredential.revokedAt)));
    const [updated] = await tx.update(industrialIntegration).set({ status: 'suspended', suspendedAt: new Date(), requiresCredentialReissue: true }).where(eq(industrialIntegration.id, integration.id)).returning();
    await tx.insert(auditLog).values({ userId: actorUserId, action: 'INDUSTRIAL_INTEGRATION_SUSPENDED', targetType: 'industrial_integration', targetId: integration.id, beforeState: { status: integration.status }, afterState: { status: 'suspended' }, metadata: JSON.stringify({ reason: input.reason }) });
    await notifyIntegrationUser(tx, integration.manufacturerId, 'industrial_integration_suspended', 'Industrial integration suspended', `TF suspended this integration. Gateway traffic is blocked. Reason: ${input.reason}`, '/dashboard/industrial');
    return updated;
  });
}

export async function revokeIndustrialIntegration(actorUserId: string, rawInput: unknown) {
  const parsed = industrialIntegrationActionSchema.safeParse(rawInput);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Integration revocation is invalid.');
  const input: IndustrialIntegrationActionInput = parsed.data;
  return db.transaction(async (tx) => {
    const [integration] = await tx.select().from(industrialIntegration).where(eq(industrialIntegration.id, input.integrationId)).for('update').limit(1);
    if (!integration || integration.status === 'revoked') throw new Error('Integration is already revoked or was not found.');
    await assertOfficerFactoryJurisdiction(actorUserId, integration.factoryId, tx);
    await tx.update(industrialGateway).set({ status: 'revoked', revokedAt: new Date() }).where(and(eq(industrialGateway.integrationId, integration.id), sql`${industrialGateway.status} <> 'revoked'`));
    await tx.update(industrialGatewayCredential).set({ revokedAt: new Date() }).where(and(inArray(industrialGatewayCredential.gatewayId, db.select({ id: industrialGateway.id }).from(industrialGateway).where(eq(industrialGateway.integrationId, integration.id))), isNull(industrialGatewayCredential.revokedAt)));
    const [updated] = await tx.update(industrialIntegration).set({ status: 'revoked', revokedAt: new Date(), requiresCredentialReissue: false }).where(eq(industrialIntegration.id, integration.id)).returning();
    await tx.insert(auditLog).values({ userId: actorUserId, action: 'INDUSTRIAL_INTEGRATION_REVOKED', targetType: 'industrial_integration', targetId: integration.id, beforeState: { status: integration.status }, afterState: { status: 'revoked' }, metadata: JSON.stringify({ reason: input.reason }) });
    await notifyIntegrationUser(tx, integration.manufacturerId, 'industrial_integration_revoked', 'Industrial integration revoked', `TF revoked this integration. Gateway traffic and configuration access are permanently blocked. Reason: ${input.reason}`, '/dashboard/industrial');
    return updated;
  });
}

export async function getIndustrialIntegrationAudit(actorUserId: string, integrationId: string) {
  const [integration] = await db.select({ factoryId: industrialIntegration.factoryId }).from(industrialIntegration).where(eq(industrialIntegration.id, integrationId)).limit(1);
  if (!integration) throw new Error('Integration not found.');
  await assertOfficerFactoryJurisdiction(actorUserId, integration.factoryId);
  return db.select().from(auditLog).where(eq(auditLog.targetId, integrationId)).orderBy(desc(auditLog.createdAt));
}

export async function listIndustrialIntegrationEvents(manufacturerId: string, integrationId: string, limit = 100) {
  return db.select({ event: industrialEvent }).from(industrialEvent)
    .innerJoin(industrialGateway, eq(industrialGateway.id, industrialEvent.gatewayId))
    .where(and(eq(industrialEvent.manufacturerId, manufacturerId), eq(industrialGateway.integrationId, integrationId)))
    .orderBy(desc(industrialEvent.receivedTimestamp)).limit(Math.min(Math.max(limit, 1), 500));
}

async function authenticateGateway(gatewayId: string, clientSecret: string, security?: GatewayRequestSecurity) {
  const rows = await db.select({ gateway: industrialGateway, credential: industrialGatewayCredential, integration: industrialIntegration })
    .from(industrialGateway)
    .innerJoin(industrialGatewayCredential, eq(industrialGatewayCredential.gatewayId, industrialGateway.id))
    .leftJoin(industrialIntegration, eq(industrialIntegration.id, industrialGateway.integrationId))
    .where(and(eq(industrialGateway.id, gatewayId), isNull(industrialGatewayCredential.revokedAt)))
    .orderBy(desc(industrialGatewayCredential.credentialVersion));
  const gateway = rows[0]?.gateway;
  const integration = rows[0]?.integration;
  if (!gateway || gateway.status !== 'active' || !gateway.integrationId || !integration || integration.status !== 'active' || integration.requiresCredentialReissue || integration.factoryId !== gateway.factoryId || integration.manufacturerId !== gateway.manufacturerId || integration.environment !== gateway.environment) throw new Error('Gateway authentication failed.');
  if (security?.keyVersion) {
    const requestedVersion = Number(security.keyVersion);
    if (!Number.isInteger(requestedVersion) || requestedVersion < 1) throw new Error('Gateway authentication failed.');
  }
  const credentialVersion = security?.keyVersion ? Number(security.keyVersion) : undefined;
  const row = rows.find((candidate) => credentialVersion === undefined || candidate.credential.credentialVersion === credentialVersion);
  if (!row || (row.credential.expiresAt && row.credential.expiresAt <= new Date()) || !equalHash(row.credential.credentialHash, hashSecret(clientSecret))) throw new Error('Gateway authentication failed.');
  if (gateway.authMode === 'signed_ed25519') {
    if (!security || security.signatureVersion !== 'v1' || !security.timestamp || !security.nonce || !security.keyVersion || !security.signature || !row.credential.publicSigningKey || row.credential.signingAlgorithm !== 'ed25519' || !isTimestampFresh(security.timestamp)) throw new Error('Gateway signature authentication failed.');
    if (!verifyGatewaySignature(row.credential.publicSigningKey, security.signature, security)) throw new Error('Gateway signature authentication failed.');
    const [nonce] = await db.insert(industrialGatewayRequestNonce).values({ gatewayId: gateway.id, nonce: security.nonce, expiresAt: new Date(Date.now() + 5 * 60 * 1_000) }).onConflictDoNothing({ target: [industrialGatewayRequestNonce.gatewayId, industrialGatewayRequestNonce.nonce] }).returning({ id: industrialGatewayRequestNonce.id });
    if (!nonce) throw new Error('Gateway request replay detected.');
    if (Math.random() < 0.02) await db.delete(industrialGatewayRequestNonce).where(sql`${industrialGatewayRequestNonce.expiresAt} <= NOW()`);
  }
  await db.update(industrialGatewayCredential).set({ lastUsedAt: new Date() }).where(eq(industrialGatewayCredential.id, row.credential.id));
  return gateway;
}

async function enforceGatewayRateLimit(gatewayId: string, namespace: string, maxRequests: number) {
  const rate = await consumeRateLimit(namespace, gatewayId, maxRequests, 60);
  if (!rate.allowed) throw new Error(`${namespace} rate limit exceeded.`);
}

export async function recordGatewayHeartbeat(gatewayId: string, clientSecret: string, rawInput: unknown, security?: GatewayRequestSecurity) {
  const gateway = await authenticateGateway(gatewayId, clientSecret, security);
  await enforceGatewayRateLimit(gateway.id, 'industrial-heartbeat-gateway', 120);
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
    await tx.update(factory).set({ connectivityStatus: 'online', integrationStatus: 'connected' }).where(eq(factory.id, gateway.factoryId));
  });
  return { gatewayId: gateway.id, acknowledgedAt: now.toISOString() };
}

export async function acknowledgeIndustrialEvents(gatewayId: string, clientSecret: string, eventIds: string[], security?: GatewayRequestSecurity) {
  const gateway = await authenticateGateway(gatewayId, clientSecret, security);
  await enforceGatewayRateLimit(gateway.id, 'industrial-acknowledgement-gateway', 600);
  const boundedIds = [...new Set(eventIds)].slice(0, 2_000);
  if (boundedIds.length === 0) return { gatewayId: gateway.id, acknowledged: 0 };
  const now = new Date();
  const updated = await db.update(industrialEventSync).set({ syncStatus: 'acknowledged', acknowledgedAt: now, errorMessage: null })
    .where(and(eq(industrialEventSync.gatewayId, gateway.id), inArray(industrialEventSync.eventId, boundedIds)))
    .returning({ id: industrialEventSync.id });
  await db.update(industrialGateway).set({ lastSyncAt: now }).where(eq(industrialGateway.id, gateway.id));
  return { gatewayId: gateway.id, acknowledged: updated.length, acknowledgedAt: now.toISOString() };
}

export async function getGatewayDiagnostics(gatewayId: string, clientSecret: string, security?: GatewayRequestSecurity) {
  const gateway = await authenticateGateway(gatewayId, clientSecret, security);
  await enforceGatewayRateLimit(gateway.id, 'industrial-diagnostics-gateway', 60);
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

export async function ingestIndustrialEvent(rawInput: unknown, clientSecret: string, security?: GatewayRequestSecurity) {
  const parsed = industrialEventSchema.safeParse(rawInput);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Industrial event is invalid.');
  const input: IndustrialEventInput = parsed.data;
  const gateway = await authenticateGateway(input.gatewayId, clientSecret, security);
  const rate = await consumeRateLimit('industrial-event-gateway', gateway.id, 6_000, 60);
  if (!rate.allowed) throw new Error('Industrial event rate limit exceeded.');
  return ingestAuthenticatedIndustrialEvent(gateway, input, rawInput as Record<string, unknown>);
}

export async function ingestAuthenticatedIndustrialEvent(gateway: typeof industrialGateway.$inferSelect, input: IndustrialEventInput, originalPayload: Record<string, unknown>) {
  if (input.eventTimestamp && new Date(input.eventTimestamp).getTime() > Date.now() + 5 * 60 * 1000) throw new Error('Event timestamp cannot be materially in the future.');
  if (gateway.factoryId !== input.factoryId) throw new Error('Gateway is not authorized for this factory.');
  if (!gateway.integrationId) throw new Error('Gateway must belong to a TF-managed integration.');
  const [integration] = await db.select({ id: industrialIntegration.id, status: industrialIntegration.status, manufacturerId: industrialIntegration.manufacturerId, factoryId: industrialIntegration.factoryId })
    .from(industrialIntegration).where(and(eq(industrialIntegration.id, gateway.integrationId), eq(industrialIntegration.manufacturerId, gateway.manufacturerId), eq(industrialIntegration.factoryId, gateway.factoryId))).limit(1);
  if (!integration || integration.status !== 'active') throw new Error('Integration is not active.');
  const incomingPayloadHash = payloadHash(originalPayload);

  const [equipment] = await db.select({ id: industrialEquipment.id, manufacturerId: industrialEquipment.manufacturerId, factoryId: industrialEquipment.factoryId, productionLineId: industrialEquipment.productionLineId, operationalStatus: industrialEquipment.operationalStatus })
    .from(industrialEquipment)
    .innerJoin(industrialIntegrationEquipment, and(eq(industrialIntegrationEquipment.equipmentId, industrialEquipment.id), eq(industrialIntegrationEquipment.integrationId, integration.id), eq(industrialIntegrationEquipment.manufacturerId, gateway.manufacturerId), eq(industrialIntegrationEquipment.factoryId, gateway.factoryId), eq(industrialIntegrationEquipment.authorizationStatus, 'authorized'), isNull(industrialIntegrationEquipment.revokedAt)))
    .where(and(eq(industrialEquipment.id, input.equipmentId), eq(industrialEquipment.manufacturerId, gateway.manufacturerId), eq(industrialEquipment.factoryId, input.factoryId), eq(industrialEquipment.productionLineId, input.lineId), inArray(industrialEquipment.operationalStatus, ['registered', 'active', 'maintenance'])))
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
    await tx.update(factory).set({ connectivityStatus: 'online', integrationStatus: 'connected' }).where(eq(factory.id, gateway.factoryId));
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
  const factoryId = batch.factoryId;
  if (!factoryId) throw new Error('Production batch is not associated with a registered factory.');

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
        factoryId,
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
  await db.execute(sql`UPDATE public.factory AS f
    SET connectivity_status = CASE
      WHEN EXISTS (
        SELECT 1 FROM public.industrial_gateway AS g
        WHERE g.factory_id = f.id
          AND g.status = 'active'
          AND g.last_heartbeat_at >= ${heartbeatCutoff}
      ) THEN 'online'
      ELSE 'offline'
    END,
    integration_status = CASE
      WHEN EXISTS (
        SELECT 1 FROM public.industrial_gateway AS g
        WHERE g.factory_id = f.id
          AND g.status = 'active'
          AND g.last_heartbeat_at >= ${heartbeatCutoff}
      ) THEN 'connected'
      ELSE 'non_compliant'
    END
    WHERE EXISTS (
      SELECT 1 FROM public.industrial_gateway AS g
      WHERE g.factory_id = f.id AND g.status = 'active'
    )`);
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
