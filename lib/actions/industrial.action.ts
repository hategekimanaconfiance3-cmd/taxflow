'use server';

import { z } from 'zod';
import { requireRRAPermission, requireTraderSession } from '@/lib/auth-guard';
import {
  activateGateway as activateGatewayRecord,
  acknowledgeIndustrialEvents as acknowledgeIndustrialEventsRecord,
  getGatewayDiagnostics as getGatewayDiagnosticsRecord,
  ingestIndustrialEvent,
  listIndustrialAlertsForManufacturer,
  getIndustrialMonitoringSummary,
  evaluateFactoryIntegrationCompliance,
  setIndustrialIntegrationPolicy,
  verifyIndustrialBatch as verifyIndustrialBatchRecord,
  listIndustrialEventsForManufacturer,
  listManufacturerEquipment,
  listManufacturerGateways,
  recordCalibration,
  updateEquipment as updateEquipmentRecord,
  recordGatewayHeartbeat,
  registerEquipment as registerEquipmentRecord,
  registerGateway as registerGatewayRecord,
  revokeGateway as revokeGatewayRecord,
  rotateGatewayCredential as rotateGatewayCredentialRecord,
} from '@/lib/industrial-integration-service';

const idSchema = z.string().uuid('Identifier is invalid.');

export async function getMyIndustrialEquipment() {
  const session = await requireTraderSession(['manufacturer']);
  return listManufacturerEquipment(session.user.id);
}

export async function registerIndustrialEquipment(rawInput: unknown) {
  const session = await requireTraderSession(['manufacturer']);
  return registerEquipmentRecord(session.user.id, rawInput);
}

export async function recordIndustrialCalibration(rawInput: unknown) {
  const session = await requireTraderSession(['manufacturer']);
  return recordCalibration(session.user.id, rawInput);
}

export async function updateIndustrialEquipment(rawInput: unknown) {
  const session = await requireTraderSession(['manufacturer']);
  return updateEquipmentRecord(session.user.id, rawInput);
}

export async function getMyIndustrialGateways() {
  const session = await requireTraderSession(['manufacturer']);
  return listManufacturerGateways(session.user.id);
}

export async function registerIndustrialGateway(rawInput: unknown) {
  const session = await requireTraderSession(['manufacturer']);
  return registerGatewayRecord(session.user.id, rawInput);
}

export async function rotateIndustrialGatewayCredential(gatewayId: string) {
  const session = await requireTraderSession(['manufacturer']);
  const parsed = idSchema.safeParse(gatewayId);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Gateway identifier is invalid.');
  return rotateGatewayCredentialRecord(session.user.id, parsed.data);
}

export async function revokeIndustrialGateway(gatewayId: string) {
  const session = await requireTraderSession(['manufacturer']);
  const parsed = idSchema.safeParse(gatewayId);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Gateway identifier is invalid.');
  return revokeGatewayRecord(session.user.id, parsed.data);
}

export async function activateIndustrialGateway(gatewayId: string) {
  const session = await requireRRAPermission('industrial.factory.review');
  const parsed = idSchema.safeParse(gatewayId);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Gateway identifier is invalid.');
  return activateGatewayRecord(session.user.id, parsed.data);
}

export async function getMyIndustrialEvents(limit?: number) {
  const session = await requireTraderSession(['manufacturer']);
  return listIndustrialEventsForManufacturer(session.user.id, limit);
}

export async function getMyIndustrialAlerts(limit?: number) {
  const session = await requireTraderSession(['manufacturer']);
  return listIndustrialAlertsForManufacturer(session.user.id, limit);
}

export async function verifyIndustrialBatch(batchId: string, tolerancePercent?: number) {
  await requireRRAPermission('industrial.factory.read');
  const parsed = idSchema.safeParse(batchId);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Batch identifier is invalid.');
  return verifyIndustrialBatchRecord(parsed.data, tolerancePercent);
}

export async function getIndustrialMonitoringSummaryForOfficer() {
  await requireRRAPermission('industrial.factory.read');
  return getIndustrialMonitoringSummary();
}

export async function configureIndustrialIntegrationPolicy(rawInput: unknown) {
  const session = await requireRRAPermission('industrial.factory.review');
  return setIndustrialIntegrationPolicy(session.user.id, rawInput);
}

export async function evaluateIndustrialIntegrationCompliance(factoryId: string) {
  await requireRRAPermission('industrial.factory.read');
  const parsed = idSchema.safeParse(factoryId);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Factory identifier is invalid.');
  return evaluateFactoryIntegrationCompliance(parsed.data);
}

export async function receiveIndustrialHeartbeat(gatewayId: string, clientSecret: string, rawInput: unknown) {
  return recordGatewayHeartbeat(gatewayId, clientSecret, rawInput);
}

export async function receiveIndustrialAcknowledgements(gatewayId: string, clientSecret: string, eventIds: string[]) {
  return acknowledgeIndustrialEventsRecord(gatewayId, clientSecret, eventIds);
}

export async function receiveIndustrialDiagnostics(gatewayId: string, clientSecret: string) {
  return getGatewayDiagnosticsRecord(gatewayId, clientSecret);
}

export async function receiveIndustrialEvent(rawInput: unknown, clientSecret: string) {
  return ingestIndustrialEvent(rawInput, clientSecret);
}
