import { get } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/db/drizzle";
import { importDeclaration } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  getImportFilenameFromBlobPath,
  importDocumentUrl,
  isImportFilenameForDeclaration,
} from "@/lib/import-files";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const verifyUploadSchema = z.object({
  declarationId: z.string().uuid(),
  pathname: z.string().trim().min(1).max(300),
}).strict();

/** Verify the completed private upload belongs to the trader and contains PDF data. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!["manufacturer", "wholesaler"].includes(session.user.role ?? "") ||
      (session.user as Record<string, unknown>).clearanceStatus !== "approved") {
    return NextResponse.json({ error: "Approved manufacturer or wholesaler account required" }, { status: 403 });
  }

  const parsed = verifyUploadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "The uploaded document could not be verified." }, { status: 400 });
  }

  const { declarationId, pathname } = parsed.data;
  const filename = getImportFilenameFromBlobPath(pathname);
  if (!filename || !isImportFilenameForDeclaration(filename, declarationId)) {
    return NextResponse.json({ error: "The uploaded document does not match this declaration." }, { status: 400 });
  }

  const [declaration] = await db
    .select({ id: importDeclaration.id })
    .from(importDeclaration)
    .where(and(
      eq(importDeclaration.id, declarationId),
      eq(importDeclaration.businessId, session.user.id),
      eq(importDeclaration.status, "pending"),
    ))
    .limit(1);
  if (!declaration) {
    return NextResponse.json({ error: "Pending declaration not found" }, { status: 404 });
  }

  try {
    const blob = await get(pathname, { access: "private" });
    if (!blob || blob.statusCode !== 200 || !blob.stream ||
        blob.blob.contentType !== "application/pdf" ||
        blob.blob.size === null || blob.blob.size <= 0 || blob.blob.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Upload a valid PDF between 1 byte and 10 MB." }, { status: 400 });
    }

    const bytes = new Uint8Array(await new Response(blob.stream).arrayBuffer());
    if (bytes.length < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
      return NextResponse.json({ error: "The uploaded file is not a valid PDF." }, { status: 400 });
    }

    return NextResponse.json({ url: importDocumentUrl(filename) });
  } catch (error) {
    const reference = crypto.randomUUID();
    console.error("Private import invoice verification failed", { reference, error });
    return NextResponse.json(
      { error: "Private document storage could not verify the upload. Please try again.", reference },
      { status: 503 },
    );
  }
}
