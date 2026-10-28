import "server-only";
import { head } from "@vercel/blob";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMPORT_FILENAME_PATTERN = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})_([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.pdf$/i;
const IMPORT_BLOB_PATH_PATTERN = /^imports\/([0-9a-f-]{36}_[0-9a-f-]{36}\.pdf)$/i;
const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024;

export function makeImportFilename(declarationId: string): string {
  if (!UUID_PATTERN.test(declarationId)) throw new TypeError("Invalid import declaration ID.");
  return `${declarationId}_${crypto.randomUUID()}.pdf`;
}

export function isImportFilenameForDeclaration(filename: string, declarationId: string): boolean {
  if (!UUID_PATTERN.test(declarationId)) return false;
  const match = IMPORT_FILENAME_PATTERN.exec(filename);
  return Boolean(match && match[1].toLowerCase() === declarationId.toLowerCase());
}

export function getImportFilenameFromBlobPath(pathname: string): string | null {
  const match = IMPORT_BLOB_PATH_PATTERN.exec(pathname);
  if (!match || !IMPORT_FILENAME_PATTERN.test(match[1])) return null;
  return match[1];
}

export function importBlobPathname(filename: string): string {
  if (!IMPORT_FILENAME_PATTERN.test(filename)) throw new TypeError("Invalid import document filename.");
  return `imports/${filename}`;
}

export function importDocumentUrl(filename: string): string {
  if (!IMPORT_FILENAME_PATTERN.test(filename)) throw new TypeError("Invalid import document filename.");
  return `/api/import-invoice/${filename}`;
}

export async function ensureImportDocumentExists(filename: string): Promise<void> {
  const blob = await head(importBlobPathname(filename));
  if (blob.size <= 0 || blob.size > MAX_IMPORT_FILE_SIZE || blob.contentType !== "application/pdf") {
    throw new Error("The uploaded import document is invalid.");
  }
}
