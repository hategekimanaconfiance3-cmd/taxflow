import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";
const ALGORITHM = "aes-256-gcm";

function encryptionKey(): Buffer {
  const configured = process.env.PAYMENT_DATA_ENCRYPTION_KEY?.trim();
  if (!configured) throw new Error("PAYMENT_DATA_ENCRYPTION_KEY is required to store or read protected payment data.");

  const key = /^[a-f\d]{64}$/i.test(configured)
    ? Buffer.from(configured, "hex")
    : Buffer.from(configured, "base64");
  if (key.length !== 32) {
    throw new Error("PAYMENT_DATA_ENCRYPTION_KEY must be a 32-byte base64 or 64-character hex key.");
  }
  return key;
}

/** Encrypt payment identifiers with AES-256-GCM before persisting them. */
export function encryptPaymentData(plaintext: string): string {
  if (plaintext.startsWith(PREFIX)) {
    decryptPaymentData(plaintext);
    return plaintext;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/** Legacy plaintext stays readable during rollout; run the backfill to encrypt existing rows. */
export function decryptPaymentData(value: string): string {
  if (!value.startsWith(PREFIX)) return value;
  const [ivText, tagText, ciphertextText, ...extra] = value.slice(PREFIX.length).split(":");
  if (!ivText || !tagText || !ciphertextText || extra.length) throw new Error("Stored payment data has an invalid encrypted format.");
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivText, "base64"));
  decipher.setAuthTag(Buffer.from(tagText, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function isPaymentDataEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}
