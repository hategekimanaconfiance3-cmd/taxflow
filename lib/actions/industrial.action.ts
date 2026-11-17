'use server';

import { z } from 'zod';
import { requireRRAPermission, requireTraderSession } from '@/lib/auth-guard';
import type { GatewayRequestSecurity } from '@/lib/industrial-security';
import {
  activateGateway as activateGatewayRecord,
  acknowledgeIndustrialEvents as acknowledgeIndustrialEventsRecord,
  getGatewayDiagnostics as getGatewayDiagnosticsRecord,
  getIndustrialIntegrationAudit,
  getIndustrialIntegrationPackage,
  getIndustrialIntegrationByIdForOfficer,
  getManufacturerIntegration,
  ingestIndustrialEvent,
  listIndustrialAlertsForManufacturer,
  getIndustrialMonitoringSummary,
  evaluateFactoryIntegrationCompliance,
  setIndustrialIntegrationPolicy,
  verifyIndustrialBatch as verifyIndustrialBatchRecord,
  listIndustrialEventsForManufacturer,
  listManufacturerEquipment,
  listManufacturerGateways,
  listManufacturerIntegrationRequests,
  listManufacturerIntegrations,
  listIndustrialIntegrationEvents,
  listIndustrialIntegrationRequestsForOfficer,
  recordCalibration,
  updateEquipment as updateEquipmentRecord,
  recordGatewayHeartbeat,
  registerEquipment as registerEquipmentRecord,
  registerGateway as registerGatewayRecord,
  revokeIndustrialIntegration as revokeIndustrialIntegrationRecord,
  requestIndustrialIntegration as requestIndustrialIntegrationRecord,
  reviewIndustrialIntegrationRequest as reviewIndustrialIntegrationRequestRecord,
  claimIndustrialIntegrationCredentials as claimIndustrialIntegrationCredentialsRecord,
  rotateIndustrialIntegrationCredential as rotateIndustrialIntegrationCredentialRecord,
  suspendIndustrialIntegration as suspendIndustrialIntegrationRecord,
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
  await requireTraderSession(['manufacturer']);
  const parsed = idSchema.safeParse(gatewayId);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Gateway identifier is invalid.');
  throw new Error('Gateway revocation is controlled by TF. Use the integration support workflow.');
}

export async function activateIndustrialGateway(gatewayId: string) {
  const session = await requireRRAPermission('industrial.integration.activate');
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
  const session = await requireRRAPermission('industrial.integration.policy.manage');
  return setIndustrialIntegrationPolicy(session.user.id, rawInput);
}

export async function evaluateIndustrialIntegrationCompliance(factoryId: string) {
  await requireRRAPermission('industrial.factory.read');
  const parsed = idSchema.safeParse(factoryId);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Factory identifier is invalid.');
  return evaluateFactoryIntegrationCompliance(parsed.data);
}

export async function receiveIndustrialHeartbeat(gatewayId: string, clientSecret: string, rawInput: unknown, security?: GatewayRequestSecurity) {
  return recordGatewayHeartbeat(gatewayId, clientSecret, rawInput, security);
}

export async function receiveIndustrialAcknowledgements(gatewayId: string, clientSecret: string, eventIds: string[], security?: GatewayRequestSecurity) {
  return acknowledgeIndustrialEventsRecord(gatewayId, clientSecret, eventIds, security);
}

export async function receiveIndustrialDiagnostics(gatewayId: string, clientSecret: string, security?: GatewayRequestSecurity) {
  return getGatewayDiagnosticsRecord(gatewayId, clientSecret, security);
}

export async function receiveIndustrialEvent(rawInput: unknown, clientSecret: string, security?: GatewayRequestSecurity) {
  return ingestIndustrialEvent(rawInput, clientSecret, security);
}

export async function requestIndustrialIntegration(rawInput: unknown) {
  const session = await requireTraderSession(['manufacturer']);
  return requestIndustrialIntegrationRecord(session.user.id, rawInput);
}

export async function getMyIndustrialIntegrationRequests() {
  const session = await requireTraderSession(['manufacturer']);
  return listManufacturerIntegrationRequests(session.user.id);
}

export async function getMyIndustrialIntegrations() {
  const session = await requireTraderSession(['manufacturer']);
  return listManufacturerIntegrations(session.user.id);
}

export async function getMyIndustrialIntegration(integrationId: string) {
  const session = await requireTraderSession(['manufacturer']);
  const parsed = idSchema.safeParse(integrationId);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Integration identifier is invalid.');
  return getManufacturerIntegration(session.user.id, parsed.data);
}

export async function claimMyIndustrialIntegrationCredentials(integrationId: string) {
  const session = await requireTraderSession(['manufacturer']);
  const parsed = idSchema.safeParse(integrationId);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Integration identifier is invalid.');
  return claimIndustrialIntegrationCredentialsRecord(session.user.id, parsed.data);
}

export async function getMyIndustrialIntegrationPackage(integrationId: string) {
  const session = await requireTraderSession(['manufacturer']);
  const parsed = idSchema.safeParse(integrationId);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Integration identifier is invalid.');
  return getIndustrialIntegrationPackage(session.user.id, parsed.data);
}

export async function rotateMyIndustrialIntegrationCredential(integrationId: string) {
  const session = await requireTraderSession(['manufacturer']);
  const parsed = idSchema.safeParse(integrationId);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Integration identifier is invalid.');
  return rotateIndustrialIntegrationCredentialRecord(session.user.id, parsed.data);
}

export async function getMyIndustrialIntegrationEvents(integrationId: string, limit?: number) {
  const session = await requireTraderSession(['manufacturer']);
  const parsed = idSchema.safeParse(integrationId);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Integration identifier is invalid.');
  return listIndustrialIntegrationEvents(session.user.id, parsed.data, limit);
}

export async function getIndustrialIntegrationRequestsForOfficer() {
  await requireRRAPermission('industrial.integration.read');
  return listIndustrialIntegrationRequestsForOfficer();
}

export async function reviewIndustrialIntegrationRequest(rawInput: unknown) {
  const session = await requireRRAPermission('industrial.integration.review');
  return reviewIndustrialIntegrationRequestRecord(session.user.id, rawInput);
}

export async function activateIndustrialIntegration(integrationId: string) {
  const session = await requireRRAPermission('industrial.integration.activate');
  const parsed = idSchema.safeParse(integrationId);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Integration identifier is invalid.');
  const integration = await getIndustrialIntegrationForOfficer(parsed.data);
  if (!integration.gateway) throw new Error('Integration gateway not found.');
  return activateGatewayRecord(session.user.id, integration.gateway.id);
}

export async function suspendIndustrialIntegration(rawInput: unknown) {
  const session = await requireRRAPermission('industrial.integration.suspend');
  return suspendIndustrialIntegrationRecord(session.user.id, rawInput);
}

export async function revokeIndustrialIntegration(rawInput: unknown) {
  const session = await requireRRAPermission('industrial.integration.revoke');
  return revokeIndustrialIntegrationRecord(session.user.id, rawInput);
}

export async function getIndustrialIntegrationAuditForOfficer(integrationId: string) {
  await requireRRAPermission('industrial.integration.audit.read');
  const parsed = idSchema.safeParse(integrationId);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Integration identifier is invalid.');
  return getIndustrialIntegrationAudit(parsed.data);
}

async function getIndustrialIntegrationForOfficer(integrationId: string) {
  return getIndustrialIntegrationByIdForOfficer(integrationId);
}
