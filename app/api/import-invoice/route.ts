import { issueSignedToken } from "@vercel/blob";
import {
  handleUploadPresigned,
  type HandleUploadPresignedBody,
} from "@vercel/blob/client";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/db/drizzle";
import { importDeclaration } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  getImportFilenameFromBlobPath,
  isImportFilenameForDeclaration,
} from "@/lib/import-files";
import { consumeRateLimit } from "@/lib/rate-limit";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const uploadTokenRequestSchema = z.object({
  type: z.literal("blob.generate-presigned-url"),
  payload: z.object({
    pathname: z.string().trim().min(1).max(300),
    multipart: z.boolean(),
    clientPayload: z.string().nullable(),
  }).strict(),
}).strict();

/** Issue a short-lived private-Blob upload URL for an owned, pending declaration. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!["manufacturer", "wholesaler"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Manufacturer or wholesaler account required" }, { status: 403 });
  }
  if ((session.user as Record<string, unknown>).clearanceStatus !== "approved") {
    return NextResponse.json({ error: "Your account must be approved before uploading import documents" }, { status: 403 });
  }

  try {
    const parsedBody = uploadTokenRequestSchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return NextResponse.json({ error: "The PDF upload request is invalid." }, { status: 400 });
    }

    const { pathname, multipart } = parsedBody.data.payload;
    const filename = getImportFilenameFromBlobPath(pathname);
    const declarationId = filename?.slice(0, 36);
    if (!filename || !declarationId || !isImportFilenameForDeclaration(filename, declarationId)) {
      return NextResponse.json({ error: "The PDF upload path is invalid." }, { status: 400 });
    }
    if (multipart) {
      return NextResponse.json({ error: "Multipart uploads are not supported for import invoices." }, { status: 400 });
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

    const rateLimit = await consumeRateLimit("import-invoice-upload", session.user.id, 10, 60 * 60);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Upload limit reached. Try again later." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }

    const body = parsedBody.data as HandleUploadPresignedBody;
    const result = await handleUploadPresigned({
      body,
      request: req,
      getSignedToken: async (requestedPathname) => {
        if (requestedPathname !== pathname) throw new Error("The PDF upload path is invalid.");

        const validUntil = Date.now() + 5 * 60 * 1000;
        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: MAX_FILE_SIZE,
          validUntil,
        });

        return {
          token,
          urlOptions: {
            allowedContentTypes: ["application/pdf"],
            maximumSizeInBytes: MAX_FILE_SIZE,
            validUntil,
            addRandomSuffix: false,
            allowOverwrite: false,
          },
        };
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    const reference = crypto.randomUUID();
    console.error("Private import invoice upload token failed", { reference, error });
    return NextResponse.json(
      { error: "Private document storage is unavailable. Please try again later.", reference },
      { status: 503 },
    );
  }
}
