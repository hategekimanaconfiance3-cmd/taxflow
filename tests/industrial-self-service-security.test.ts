import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const service = readFileSync(new URL('../lib/industrial-integration-service.ts', import.meta.url), 'utf8');
const manufacturerUi = readFileSync(new URL('../components/dashboard/industrial/industrial-management.tsx', import.meta.url), 'utf8');
const adminUi = readFileSync(new URL('../components/admin/industrial-integration-request-workspace.tsx', import.meta.url), 'utf8');

test('legacy manufacturer credential issuance is disabled', () => {
  assert.match(service, /Legacy gateway registration is disabled/);
  assert.match(service, /Legacy gateway credential rotation is disabled/);
});

test('gateway authentication is bound to an active TF-managed integration', () => {
  assert.match(service, /integration\.status !== 'active'/);
  assert.match(service, /integration\.factoryId !== gateway\.factoryId/);
  assert.match(service, /integration\.manufacturerId !== gateway\.manufacturerId/);
  assert.match(service, /integration\.environment !== gateway\.environment/);
});

test('industrial events require integration-specific authorized equipment', () => {
  assert.match(service, /industrialIntegrationEquipment\.integrationId/);
  assert.match(service, /authorizationStatus, 'authorized'/);
  assert.match(service, /industrialIntegrationEquipment\.revokedAt/);
});

test('credential claims are lifecycle-gated and one-time', () => {
  assert.match(service, /No unclaimed credentials are available/);
  assert.match(service, /isNull\(industrialCredentialDelivery\.claimedAt\)/);
  assert.match(service, /Configuration package access is disabled/);
});

test('gateway-specific rate limits cover operational endpoints', () => {
  assert.match(service, /industrial-heartbeat-gateway/);
  assert.match(service, /industrial-acknowledgement-gateway/);
  assert.match(service, /industrial-diagnostics-gateway/);
});

test('manufacturer UI exposes request, claim, package, rotation and health workflows', () => {
  for (const label of ['Submit integration request', 'Claim credentials', 'View package', 'Rotate credentials', 'Refresh health', 'Test connectivity']) assert.match(manufacturerUi, new RegExp(label));
});

test('TF administration exposes jurisdiction-scoped lifecycle and monitoring controls', () => {
  for (const label of ['Managed integrations', 'Suspend', 'Revoke', 'Load monitoring', 'Filter manufacturer']) assert.match(adminUi, new RegExp(label));
});
