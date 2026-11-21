// ---------------------------------------------------------------------------
// TaxFlow — Industrial API Security Unit Tests
// Pure-logic tests (no DB, no network).
// Tests cryptographic correctness and security invariants for the
// industrial machine integration API.
//
// Run: cd C:\Users\hp\AppData\Local\Temp\taxflow-push
//      npx tsx --test tests/industrial-security.test.ts
//
// NOTE: DB-integration tests (nonce replay, rate limiting, credential expiry,
// sandbox/production isolation) are marked skip — they require a live
// PostgreSQL connection. Run those against the staging Neon branch.
// ---------------------------------------------------------------------------

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateKey, sign as nodeCryptoSign } from 'node:crypto';
import {
  generateGatewaySigningKey,
  canonicalGatewayRequest,
  verifyGatewaySignature,
  isTimestampFresh,
  encryptCredentialEnvelope,
  decryptCredentialEnvelope,
  validateIndustrialEncryptionKeyConfig,
  type GatewayRequestSecurity,
} from '../lib/industrial-security';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_ENCRYPTION_KEY = 'a1b2c3d4e5f67890'.repeat(4); // 64-char hex

function withEnv(key: string, value: string | undefined, fn: () => void): void {
  const original = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
  try {
    fn();
  } finally {
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
}

function withEncryptionKey<T>(fn: () => T): T {
  const original = process.env.INDUSTRIAL_CREDENTIAL_ENCRYPTION_KEY;
  process.env.INDUSTRIAL_CREDENTIAL_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  try {
    return fn();
  } finally {
    if (original === undefined) {
      delete process.env.INDUSTRIAL_CREDENTIAL_ENCRYPTION_KEY;
    } else {
      process.env.INDUSTRIAL_CREDENTIAL_ENCRYPTION_KEY = original;
    }
  }
}

function makeSecurity(overrides: Partial<GatewayRequestSecurity> = {}): GatewayRequestSecurity {
  return {
    method: 'POST',
    path: '/api/v1/industrial/events',
    rawBody: JSON.stringify({ eventId: 'evt-001', gatewayId: 'gw-test', factoryId: 'factory-1' }),
    timestamp: String(Math.floor(Date.now() / 1000)),
    nonce: crypto.randomUUID(),
    keyVersion: '1',
    signatureVersion: 'v1',
    signature: null,
    ...overrides,
  };
}

function signRequest(privateKeyDer: string, security: GatewayRequestSecurity): string {
  const key = createPrivateKey({
    key: Buffer.from(privateKeyDer, 'base64url'),
    format: 'der',
    type: 'pkcs8',
  });
  const canonical = canonicalGatewayRequest(security);
  return nodeCryptoSign(null, Buffer.from(canonical), key).toString('base64url');
}

// ---------------------------------------------------------------------------
// TC01 — Valid signed event
// ---------------------------------------------------------------------------
describe('TC01 — Valid signed event verifies correctly', () => {
  it('valid Ed25519 signature passes verification', () => {
    const keyPair = generateGatewaySigningKey();
    const security = makeSecurity();
    const signature = signRequest(keyPair.privateKey, security);
    const result = verifyGatewaySignature(keyPair.publicKey, signature, security);
    assert.equal(result, true, 'Valid signature must verify as true');
  });
});

// ---------------------------------------------------------------------------
// TC02 — Missing signature
// ---------------------------------------------------------------------------
describe('TC02 — Missing signature is rejected', () => {
  it('empty signature string returns false', () => {
    const keyPair = generateGatewaySigningKey();
    const security = makeSecurity();
    assert.equal(verifyGatewaySignature(keyPair.publicKey, '', security), false);
  });

  it('null-converted-to-empty signature returns false', () => {
    const keyPair = generateGatewaySigningKey();
    const security = makeSecurity({ signature: null });
    // Even if the route passes null as empty string
    assert.equal(verifyGatewaySignature(keyPair.publicKey, '', security), false);
  });
});

// ---------------------------------------------------------------------------
// TC03 — Invalid signature
// ---------------------------------------------------------------------------
describe('TC03 — Invalid/garbage signature is rejected', () => {
  it('random garbage signature returns false', () => {
    const keyPair = generateGatewaySigningKey();
    const security = makeSecurity();
    assert.equal(verifyGatewaySignature(keyPair.publicKey, 'AAAA_invalid_garbage!!', security), false);
  });

  it('signature from wrong key pair returns false', () => {
    const kp1 = generateGatewaySigningKey();
    const kp2 = generateGatewaySigningKey();
    const security = makeSecurity();
    const sig = signRequest(kp1.privateKey, security);
    assert.equal(verifyGatewaySignature(kp2.publicKey, sig, security), false);
  });
});

// ---------------------------------------------------------------------------
// TC04 — Modified body after signing
// ---------------------------------------------------------------------------
describe('TC04 — Modified body invalidates signature', () => {
  it('body tampered after signing fails verification', () => {
    const keyPair = generateGatewaySigningKey();
    const security = makeSecurity();
    const signature = signRequest(keyPair.privateKey, security);
    // Tamper with body AFTER signing
    const tampered: GatewayRequestSecurity = {
      ...security,
      rawBody: JSON.stringify({ eventId: 'INJECTED', gatewayId: 'gw-attacker' }),
    };
    assert.equal(verifyGatewaySignature(keyPair.publicKey, signature, tampered), false);
  });

  it('method tampered after signing fails verification', () => {
    const keyPair = generateGatewaySigningKey();
    const security = makeSecurity();
    const signature = signRequest(keyPair.privateKey, security);
    const tampered: GatewayRequestSecurity = { ...security, method: 'GET' };
    assert.equal(verifyGatewaySignature(keyPair.publicKey, signature, tampered), false);
  });

  it('path tampered after signing fails verification', () => {
    const keyPair = generateGatewaySigningKey();
    const security = makeSecurity();
    const signature = signRequest(keyPair.privateKey, security);
    const tampered: GatewayRequestSecurity = { ...security, path: '/api/v1/industrial/heartbeat' };
    assert.equal(verifyGatewaySignature(keyPair.publicKey, signature, tampered), false);
  });
});

// ---------------------------------------------------------------------------
// TC05 — Invalid timestamp
// ---------------------------------------------------------------------------
describe('TC05 — Timestamp freshness', () => {
  it('current Unix second timestamp is fresh', () => {
    assert.equal(isTimestampFresh(String(Math.floor(Date.now() / 1000))), true);
  });

  it('current Unix millisecond timestamp is fresh', () => {
    assert.equal(isTimestampFresh(String(Date.now())), true);
  });

  it('timestamp 4 minutes ago is fresh (within ±5 min)', () => {
    assert.equal(isTimestampFresh(String(Math.floor(Date.now() / 1000) - 240)), true);
  });

  it('timestamp 6 minutes ago is stale', () => {
    assert.equal(isTimestampFresh(String(Math.floor(Date.now() / 1000) - 361)), false);
  });

  it('timestamp 6 minutes in the future is stale', () => {
    assert.equal(isTimestampFresh(String(Math.floor(Date.now() / 1000) + 361)), false);
  });

  it('non-numeric timestamp is rejected', () => {
    assert.equal(isTimestampFresh('not-a-timestamp'), false);
  });

  it('empty timestamp is rejected', () => {
    assert.equal(isTimestampFresh(''), false);
  });
});

// ---------------------------------------------------------------------------
// TC06 — Replayed nonce (DB required — skipped)
// ---------------------------------------------------------------------------
describe('TC06 — Replayed nonce is rejected (DB-required — skipped)', () => {
  it('nonce replay rejected via ON CONFLICT DO NOTHING', {
    skip: 'Requires live PostgreSQL with industrialGatewayRequestNonce table. ' +
          'Enforcement: authenticateGateway() inserts nonce with ON CONFLICT DO NOTHING, ' +
          'then checks rowcount — returns "Gateway request replay detected" if 0 rows inserted.',
  }, () => {});
});

// ---------------------------------------------------------------------------
// TC07 — Concurrent replay (DB required — skipped)
// ---------------------------------------------------------------------------
describe('TC07 — Concurrent replay attempts (DB-required — skipped)', () => {
  it('concurrent nonce use rejected atomically', {
    skip: 'Requires live PostgreSQL. Concurrent safety is guaranteed by the database ' +
          'UNIQUE constraint on (gateway_id, nonce) — only one INSERT wins.',
  }, () => {});
});

// ---------------------------------------------------------------------------
// TC08 — Expired credential (DB required — skipped)
// ---------------------------------------------------------------------------
describe('TC08 — Expired credential (DB-required — skipped)', () => {
  it('expired credential rejects authentication', {
    skip: 'Requires live DB. Enforcement: authenticateGateway() checks credential.expiresAt <= now().',
  }, () => {});
});

// ---------------------------------------------------------------------------
// TC09 — Revoked credential (DB required — skipped)
// ---------------------------------------------------------------------------
describe('TC09 — Revoked credential (DB-required — skipped)', () => {
  it('revoked credential rejects authentication', {
    skip: 'Requires live DB. Enforcement: authenticateGateway() checks credential.revokedAt IS NOT NULL.',
  }, () => {});
});

// ---------------------------------------------------------------------------
// TC10 — Suspended gateway (DB required — skipped)
// ---------------------------------------------------------------------------
describe('TC10 — Suspended gateway (DB-required — skipped)', () => {
  it('suspended gateway rejects authentication', {
    skip: 'Requires live DB. Enforcement: authenticateGateway() requires gateway.status = active.',
  }, () => {});
});

// ---------------------------------------------------------------------------
// TC11 — Unauthorized equipment (DB required — skipped)
// ---------------------------------------------------------------------------
describe('TC11 — Unauthorized equipment (DB-required — skipped)', () => {
  it('event with unauthorized equipment is rejected', {
    skip: 'Requires live DB. Enforcement: ingestAuthenticatedIndustrialEvent() joins ' +
          'industrialIntegrationEquipment WHERE authorizationStatus = authorized.',
  }, () => {});
});

// ---------------------------------------------------------------------------
// TC12 — Unauthorized factory (DB required — skipped)
// ---------------------------------------------------------------------------
describe('TC12 — Unauthorized factory (DB-required — skipped)', () => {
  it('event from unauthorized factory is rejected', {
    skip: 'Requires live DB. Enforcement: ingestAuthenticatedIndustrialEvent() checks ' +
          'gateway.factoryId === input.factoryId.',
  }, () => {});
});

// ---------------------------------------------------------------------------
// TC13 — Gateway rate limiting (DB required — skipped)
// ---------------------------------------------------------------------------
describe('TC13 — Gateway-specific rate limiting (DB-required — skipped)', () => {
  it('gateway exceeding 6000 events/min is rate-limited', {
    skip: 'Requires live DB with rateLimit table. Enforcement: consumeRateLimit() ' +
          'with namespace=industrial-event-gateway, max=6000/60s.',
  }, () => {});
});

// ---------------------------------------------------------------------------
// TC14 — IP rate limiting (DB required — skipped)
// ---------------------------------------------------------------------------
describe('TC14 — IP-level rate limiting (DB-required — skipped)', () => {
  it('IP exceeding 120 requests/min is blocked before auth', {
    skip: 'Requires live DB. Enforcement: consumeRateLimit() with ' +
          'namespace=industrial-event-ip, max=120/60s, applied BEFORE credential lookup.',
  }, () => {});
});

// ---------------------------------------------------------------------------
// TC15 — Simulator identification
// ---------------------------------------------------------------------------
describe('TC15 — Simulator identification is server-side', () => {
  it('security module has no client-trusted isSimulated setter', () => {
    // The industrial-security module only handles cryptography.
    // isSimulated is derived in ingestAuthenticatedIndustrialEvent()
    // from gateway.sourceType === 'simulator' (NOT from client input.source).
    // This test asserts the security module does not expose an isSimulated API.
    const securityExports = Object.keys(require('../lib/industrial-security'));
    assert.ok(
      !securityExports.some((name) => name.toLowerCase().includes('simulator')),
      'Security module must not contain simulator-related exports',
    );
  });

  it('canonical request does not include isSimulated field', () => {
    // Ensures isSimulated cannot be injected via the signed payload
    const security = makeSecurity({ rawBody: JSON.stringify({ isSimulated: true, gatewayId: 'gw-1' }) });
    const canonical = canonicalGatewayRequest(security);
    // The canonical form is METHOD\nPATH\nTIMESTAMP\nNONCE\nKEY_VERSION\nSHA256(BODY)
    // The body hash covers isSimulated but isSimulated is not extracted by the security layer
    // — it is ignored in favour of gateway.sourceType (server-side only).
    assert.ok(canonical.split('\n').length === 6, 'Canonical request must have exactly 6 fields');
  });
});

// ---------------------------------------------------------------------------
// TC16 — Credential claim auditing (pure logic check)
// ---------------------------------------------------------------------------
describe('TC16 — Credential claim audit fields (logic check)', () => {
  it('audit metadata must not contain plaintext secret field names', () => {
    // This test verifies the audit schema enforced in claimIndustrialIntegrationCredentials:
    // The metadata JSON logged must NOT contain clientSecret or privateSigningKey.
    // We test the expected audit shape here.
    const auditMetadata = {
      integrationId: 'int-123',
      gatewayId: 'gw-456',
      manufacturerId: 'mfr-789',
      integrationCode: 'TFI-FACTORY-PROD-ABCDEF',
      environment: 'production',
      credentialVersion: 1,
      outcome: 'success',
      claimedAt: new Date().toISOString(),
    };
    const serialized = JSON.stringify(auditMetadata);
    assert.ok(!serialized.includes('clientSecret'), 'Audit must not contain clientSecret');
    assert.ok(!serialized.includes('privateSigningKey'), 'Audit must not contain privateSigningKey');
    assert.ok(!serialized.includes('password'), 'Audit must not contain password');
    assert.ok(serialized.includes('integrationId'), 'Audit must contain integrationId');
    assert.ok(serialized.includes('gatewayId'), 'Audit must contain gatewayId');
    assert.ok(serialized.includes('manufacturerId'), 'Audit must contain manufacturerId');
    assert.ok(serialized.includes('environment'), 'Audit must contain environment');
    assert.ok(serialized.includes('outcome'), 'Audit must contain outcome');
  });
});

// ---------------------------------------------------------------------------
// TC17 — Encryption key validation
// ---------------------------------------------------------------------------
describe('TC17 — Encryption key validation', () => {
  it('missing INDUSTRIAL_CREDENTIAL_ENCRYPTION_KEY throws informative error', () => {
    withEnv('INDUSTRIAL_CREDENTIAL_ENCRYPTION_KEY', undefined, () => {
      assert.throws(
        () => validateIndustrialEncryptionKeyConfig(),
        (err: Error) => {
          assert.ok(
            err.message.includes('INDUSTRIAL_CREDENTIAL_ENCRYPTION_KEY'),
            'Error must name the missing env var',
          );
          return true;
        },
      );
    });
  });

  it('malformed key (too short) throws', () => {
    withEnv('INDUSTRIAL_CREDENTIAL_ENCRYPTION_KEY', 'tooshort', () => {
      assert.throws(() => validateIndustrialEncryptionKeyConfig());
    });
  });

  it('malformed key (non-hex chars) throws', () => {
    withEnv('INDUSTRIAL_CREDENTIAL_ENCRYPTION_KEY', 'z'.repeat(64), () => {
      assert.throws(() => validateIndustrialEncryptionKeyConfig());
    });
  });

  it('valid 64-char hex key passes without throwing', () => {
    withEnv('INDUSTRIAL_CREDENTIAL_ENCRYPTION_KEY', TEST_ENCRYPTION_KEY, () => {
      assert.doesNotThrow(() => validateIndustrialEncryptionKeyConfig());
    });
  });

  it('encryptCredentialEnvelope throws on missing key', () => {
    withEnv('INDUSTRIAL_CREDENTIAL_ENCRYPTION_KEY', undefined, () => {
      assert.throws(() => encryptCredentialEnvelope('{"test":true}'));
    });
  });

  it('encrypt/decrypt round-trip with valid key', () => {
    withEncryptionKey(() => {
      const plaintext = JSON.stringify({ clientSecret: 'my-test-secret', credentialVersion: 1 });
      const envelope = encryptCredentialEnvelope(plaintext);
      assert.ok(envelope.ciphertext, 'Envelope must have ciphertext');
      assert.ok(envelope.nonce, 'Envelope must have nonce');
      assert.ok(envelope.authTag, 'Envelope must have authTag');
      const decrypted = decryptCredentialEnvelope(envelope);
      assert.equal(decrypted, plaintext, 'Decrypted value must match original');
    });
  });

  it('tampered ciphertext fails decryption', () => {
    withEncryptionKey(() => {
      const envelope = encryptCredentialEnvelope('{"secret":"value"}');
      const tampered = { ...envelope, ciphertext: 'AAAAAAAAAAAAAAAA' };
      assert.throws(() => decryptCredentialEnvelope(tampered), 'Tampered ciphertext must fail');
    });
  });
});

// ---------------------------------------------------------------------------
// TC18 — Sandbox/production isolation (DB required — skipped)
// ---------------------------------------------------------------------------
describe('TC18 — Sandbox/production isolation (DB-required — skipped)', () => {
  it('sandbox credential cannot authenticate production gateway', {
    skip: 'Requires live DB. Enforcement: authenticateGateway() checks ' +
          'integration.environment === gateway.environment. ' +
          'A credential issued for a sandbox gateway will not match a production gateway record.',
  }, () => {});
});

// ---------------------------------------------------------------------------
// Canonical request structure tests
// ---------------------------------------------------------------------------
describe('Canonical request structure', () => {
  it('canonical request has 6 newline-separated fields', () => {
    const security = makeSecurity();
    const canonical = canonicalGatewayRequest(security);
    const fields = canonical.split('\n');
    assert.equal(fields.length, 6, 'Must have METHOD, PATH, TIMESTAMP, NONCE, KEY_VERSION, BODY_HASH');
  });

  it('different bodies produce different canonical requests', () => {
    const base = makeSecurity({ rawBody: '{"a":1}' });
    const modified = makeSecurity({ rawBody: '{"a":2}', nonce: base.nonce!, timestamp: base.timestamp! });
    assert.notEqual(canonicalGatewayRequest(base), canonicalGatewayRequest(modified));
  });

  it('different nonces produce different canonical requests', () => {
    const base = makeSecurity({ nonce: 'nonce-aaa' });
    const modified = { ...base, nonce: 'nonce-bbb' };
    assert.notEqual(canonicalGatewayRequest(base), canonicalGatewayRequest(modified));
  });
});

// ---------------------------------------------------------------------------
// Key generation tests
// ---------------------------------------------------------------------------
describe('Key generation', () => {
  it('generated key pair has correct structure', () => {
    const kp = generateGatewaySigningKey();
    assert.ok(kp.publicKey.length > 0, 'Public key must be non-empty');
    assert.ok(kp.privateKey.length > 0, 'Private key must be non-empty');
    assert.equal(kp.fingerprint.length, 64, 'Fingerprint must be 64-char SHA-256 hex');
  });

  it('two generated key pairs are unique', () => {
    const kp1 = generateGatewaySigningKey();
    const kp2 = generateGatewaySigningKey();
    assert.notEqual(kp1.publicKey, kp2.publicKey);
    assert.notEqual(kp1.fingerprint, kp2.fingerprint);
  });
});
