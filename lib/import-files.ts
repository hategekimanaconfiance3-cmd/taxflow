import "server-only";
import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getImportUploadDirectory(): string {
  return process.env.TAXFLOW_PRIVATE_UPLOAD_DIR || join(process.cwd(), "private-uploads", "imports");
}

export function makeImportFilename(declarationId: string): string {
  if (!UUID_PATTERN.test(declarationId)) throw new TypeError("Invalid import declaration ID.");
  return `${declarationId}_${crypto.randomUUID()}.pdf`;
}

export function isImportFilenameForDeclaration(filename: string, declarationId: string): boolean {
  if (!UUID_PATTERN.test(declarationId)) return false;
  return new RegExp(`^${declarationId}_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.pdf$`, "i").test(filename);
}

export function importDocumentUrl(filename: string): string {
  return `/api/import-invoice/${filename}`;
}

export async function ensureImportDocumentExists(filename: string): Promise<void> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/i.test(filename)) {
    throw new Error("Invalid invoice document reference.");
  }
  await access(join(getImportUploadDirectory(), filename));
}

export async function prepareImportUploadDirectory(): Promise<string> {
  const directory = getImportUploadDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return directory;
}
