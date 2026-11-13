import { createHash } from "node:crypto";
import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const uploadBodySchema = z.object({
  type: z.literal("blob.generate-presigned-url"),
  payload: z.object({ pathname: z.string().trim().min(1).max(300), multipart: z.boolean(), clientPayload: z.string().nullable() }).strict(),
}).strict();

function prefixFor(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 24);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user || session.user.isActive === false || !["manufacturer", "wholesaler", "retailer"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "An authenticated taxpayer account is required." }, { status: 401 });
  }
  const parsed = uploadBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.payload.multipart) return NextResponse.json({ error: "The PDF upload request is invalid." }, { status: 400 });
  const pathname = parsed.data.payload.pathname;
  const pattern = new RegExp(`^taxpayer-corrections/${prefixFor(session.user.id)}/[0-9a-f-]{36}\\.pdf$`, "i");
  if (!pattern.test(pathname)) return NextResponse.json({ error: "The upload path is invalid for this account." }, { status: 403 });
  try {
    const limit = await consumeRateLimit("taxpayer-correction-evidence-upload", session.user.id, 20, 60 * 60);
    if (!limit.allowed) return NextResponse.json({ error: "Too many evidence uploads. Try again later." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
    const result = await handleUploadPresigned({
      body: parsed.data as HandleUploadPresignedBody,
      request,
      getSignedToken: async (requestedPath) => {
        if (requestedPath !== pathname) throw new Error("Invalid correction evidence pathname.");
        const validUntil = Date.now() + 5 * 60 * 1000;
        const token = await issueSignedToken({ pathname, operations: ["put"], allowedContentTypes: ["application/pdf"], maximumSizeInBytes: MAX_FILE_SIZE, validUntil });
        return { token, urlOptions: { allowedContentTypes: ["application/pdf"], maximumSizeInBytes: MAX_FILE_SIZE, validUntil, addRandomSuffix: false, allowOverwrite: false } };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    const reference = crypto.randomUUID();
    console.error("Correction evidence upload authorization failed", { reference, error });
    return NextResponse.json({ error: "Private evidence storage is unavailable. Please try again.", reference }, { status: 503 });
  }
}
