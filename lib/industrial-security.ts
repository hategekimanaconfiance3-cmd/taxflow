import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  timingSafeEqual,
  verify,
} from 'node:crypto';

export interface GatewayRequestSecurity {
  method: string;
  path: string;
  rawBody: string;
  timestamp: string | null;
  nonce: string | null;
  keyVersion: string | null;
  signatureVersion: string | null;
  signature: string | null;
}

export interface GeneratedGatewaySigningKey {
  publicKey: string;
  privateKey: string;
  fingerprint: string;
}

export interface EncryptedCredentialEnvelope {
  ciphertext: string;
  nonce: string;
  authTag: string;
  keyVersion: string;
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function equalSecretHash(expected: string, supplied: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'hex');
  const suppliedBuffer = Buffer.from(supplied, 'hex');
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function base64Url(value: Buffer): string {
  return value.toString('base64url');
}

export function generateGatewaySigningKey(): GeneratedGatewaySigningKey {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicDer = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  const privateDer = privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer;
  return {
    publicKey: base64Url(publicDer),
    privateKey: base64Url(privateDer),
    fingerprint: createHash('sha256').update(publicDer).digest('hex'),
  };
}

export function canonicalGatewayRequest(security: GatewayRequestSecurity): string {
  const bodyHash = createHash('sha256').update(security.rawBody).digest('hex');
  return [security.method.toUpperCase(), security.path, security.timestamp ?? '', security.nonce ?? '', security.keyVersion ?? '', bodyHash].join('\n');
}

export function verifyGatewaySignature(publicKey: string, signature: string, security: GatewayRequestSecurity): boolean {
  try {
    const key = createPublicKey({ key: Buffer.from(publicKey, 'base64url'), format: 'der', type: 'spki' });
    return verify(null, Buffer.from(canonicalGatewayRequest(security)), key, Buffer.from(signature, 'base64url'));
  } catch {
    return false;
  }
}

export function getIndustrialCredentialEncryptionKey(): Buffer {
  const configured = process.env.INDUSTRIAL_CREDENTIAL_ENCRYPTION_KEY;
  if (!configured || !/^[a-f0-9]{64}$/i.test(configured)) {
    throw new Error('INDUSTRIAL_CREDENTIAL_ENCRYPTION_KEY must be a 32-byte hexadecimal secret.');
  }
  return Buffer.from(configured, 'hex');
}

export function encryptCredentialEnvelope(plaintext: string): EncryptedCredentialEnvelope {
  const key = getIndustrialCredentialEncryptionKey();
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext: base64Url(ciphertext), nonce: base64Url(nonce), authTag: base64Url(authTag), keyVersion: 'v1' };
}

export function decryptCredentialEnvelope(envelope: EncryptedCredentialEnvelope): string {
  const key = getIndustrialCredentialEncryptionKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.nonce, 'base64url'));
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function createIntegrationCode(factoryCode: string, environment: 'sandbox' | 'production'): string {
  const safeFactoryCode = factoryCode.replace(/[^A-Za-z0-9]/g, '').slice(0, 24).toUpperCase() || 'FACTORY';
  return `TFI-${safeFactoryCode}-${environment.toUpperCase()}-${randomBytes(6).toString('hex').toUpperCase()}`;
}

export function createGatewayCode(): string {
  return `GW-${randomBytes(6).toString('hex').toUpperCase()}`;
}

export function isTimestampFresh(timestamp: string, toleranceMs = 5 * 60 * 1_000): boolean {
  const parsed = Number(timestamp);
  if (!Number.isInteger(parsed)) return false;
  const milliseconds = parsed < 10_000_000_000 ? parsed * 1_000 : parsed;
  return Math.abs(Date.now() - milliseconds) <= toleranceMs;
}

