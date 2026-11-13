import { createHash } from 'node:crypto';

/** Create a stable transaction UUID for safe retries of one submitted product line. */
export function createSaleTransactionId(actorUserId: string, submissionKey: string, productId: string): string {
  const bytes = createHash('sha256')
    .update(JSON.stringify([actorUserId, submissionKey, productId]))
    .digest()
    .subarray(0, 16);
  // Mark the deterministic 128-bit value as a version-5 UUID with RFC variant bits.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
