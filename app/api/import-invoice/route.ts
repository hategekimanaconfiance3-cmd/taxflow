import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import db from "@/db/drizzle";
import { importDeclaration } from "@/db/schema";
import { importDocumentUrl, makeImportFilename, prepareImportUploadDirectory } from "@/lib/import-files";
import { consumeRateLimit } from "@/lib/rate-limit";
import { importDeclarationIdSchema } from "@/lib/validation/import.schema";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Upload a PDF for an owned, pending import declaration. Files are stored privately. */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  if (!["manufacturer", "wholesaler"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Manufacturer or wholesaler account required" }, { status: 403 });
  }
  if ((session.user as Record<string, unknown>).clearanceStatus !== "approved") {
    return NextResponse.json({ error: "Your account must be approved before uploading import documents" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const declarationId = formData.get("declarationId");
    const file = formData.get("file");
    const parsedDeclarationId = importDeclarationIdSchema.safeParse(declarationId);
    if (!parsedDeclarationId.success) {
      return NextResponse.json({ error: "A valid declaration ID is required" }, { status: 400 });
    }
    const safeDeclarationId = parsedDeclarationId.data;
    if (!(file instanceof File)) return NextResponse.json({ error: "No PDF file provided" }, { status: 400 });

    const [declaration] = await db
      .select({ id: importDeclaration.id })
      .from(importDeclaration)
      .where(and(
        eq(importDeclaration.id, safeDeclarationId),
        eq(importDeclaration.businessId, session.user.id),
        eq(importDeclaration.status, "pending"),
      ))
      .limit(1);
    if (!declaration) return NextResponse.json({ error: "Pending declaration not found" }, { status: 404 });

    const rateLimit = await consumeRateLimit("import-invoice-upload", session.user.id, 10, 60 * 60);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Upload limit reached. Try again later." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }

    if (file.type !== "application/pdf" || file.size === 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Upload a PDF between 1 byte and 10 MB" }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
      return NextResponse.json({ error: "The uploaded file is not a valid PDF" }, { status: 400 });
    }

    const filename = makeImportFilename(safeDeclarationId);
    const directory = await prepareImportUploadDirectory();
    await writeFile(join(directory, filename), bytes, { flag: "wx", mode: 0o600 });
    return NextResponse.json({ url: importDocumentUrl(filename), filename });
  } catch (error) {
    console.error("Private import invoice upload failed", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
