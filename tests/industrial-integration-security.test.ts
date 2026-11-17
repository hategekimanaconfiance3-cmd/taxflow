import assert from 'node:assert/strict';
import { createPrivateKey, sign } from 'node:crypto';
import test from 'node:test';
import {
  canonicalGatewayRequest,
  decryptCredentialEnvelope,
  encryptCredentialEnvelope,
  generateGatewaySigningKey,
  isTimestampFresh,
  verifyGatewaySignature,
  type GatewayRequestSecurity,
} from '@/lib/industrial-security';

function request(overrides: Partial<GatewayRequestSecurity> = {}): GatewayRequestSecurity {
  return {
    method: 'POST',
    path: '/api/v1/industrial/events',
    rawBody: '{"eventId":"evt-1"}',
    timestamp: String(Math.floor(Date.now() / 1_000)),
    nonce: 'nonce-1',
    keyVersion: '1',
    signatureVersion: 'v1',
    signature: null,
    ...overrides,
  };
}

test('industrial gateway signatures verify only for the exact canonical request', () => {
  const keys = generateGatewaySigningKey();
  const unsigned = request();
  const privateKey = createPrivateKey({ key: Buffer.from(keys.privateKey, 'base64url'), format: 'der', type: 'pkcs8' });
  const signature = sign(null, Buffer.from(canonicalGatewayRequest(unsigned)), privateKey).toString('base64url');
  assert.equal(verifyGatewaySignature(keys.publicKey, signature, { ...unsigned, signature }), true);
  assert.equal(verifyGatewaySignature(keys.publicKey, signature, { ...unsigned, rawBody: '{"eventId":"tampered"}', signature }), false);
});

test('industrial credential envelopes encrypt and decrypt without exposing plaintext fields', () => {
  const previous = process.env.INDUSTRIAL_CREDENTIAL_ENCRYPTION_KEY;
  process.env.INDUSTRIAL_CREDENTIAL_ENCRYPTION_KEY = 'a'.repeat(64);
  try {
    const envelope = encryptCredentialEnvelope('{"clientSecret":"one-time-secret"}');
    assert.notEqual(envelope.ciphertext, '{"clientSecret":"one-time-secret"}');
    assert.equal(decryptCredentialEnvelope(envelope), '{"clientSecret":"one-time-secret"}');
  } finally {
    if (previous === undefined) delete process.env.INDUSTRIAL_CREDENTIAL_ENCRYPTION_KEY;
    else process.env.INDUSTRIAL_CREDENTIAL_ENCRYPTION_KEY = previous;
  }
});

test('gateway timestamps accept the short replay window and reject stale requests', () => {
  assert.equal(isTimestampFresh(String(Math.floor(Date.now() / 1_000))), true);
  assert.equal(isTimestampFresh(String(Math.floor((Date.now() - 10 * 60 * 1_000) / 1_000))), false);
});
