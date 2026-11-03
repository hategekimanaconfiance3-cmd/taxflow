import { get } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/db/drizzle";
import { auditLog, rraStaff, rraStaffRole, taxpayerCorrectionEvent, taxpayerCorrectionEvidence, taxpayerCorrectionRequest } from "@/db/schema";
import { auth } from "@/lib/auth";
import { hasRRAPermission, isRRARole } from "@/lib/rra-rbac";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function GET(request: NextRequest, context: { params: Promise<{ evidenceId: string }> }): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user || session.user.isActive === false) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { evidenceId } = await context.params;
  if (!z.string().uuid().safeParse(evidenceId).success) return NextResponse.json({ error: "Evidence not found." }, { status: 404 });
  const [staff] = await db.select().from(rraStaff).where(and(eq(rraStaff.userId, session.user.id), eq(rraStaff.isActive, true))).limit(1);
  if (!staff) return NextResponse.json({ error: "Evidence not found." }, { status: 404 });
  const roleRows = await db.select({ role: rraStaffRole.role }).from(rraStaffRole).where(eq(rraStaffRole.staffRecordId, staff.id));
  const roles = (roleRows.length ? roleRows.map((row) => row.role) : [staff.clearanceLevel]).filter(isRRARole);
  if (!roles.some((role) => hasRRAPermission(role, "taxpayer.correction.read_evidence"))) return NextResponse.json({ error: "Evidence not found." }, { status: 404 });
  const [evidence] = await db.select({ id: taxpayerCorrectionEvidence.id, path: taxpayerCorrectionEvidence.blobPathname, requestId: taxpayerCorrectionRequest.id })
    .from(taxpayerCorrectionEvidence).innerJoin(taxpayerCorrectionRequest, eq(taxpayerCorrectionRequest.id, taxpayerCorrectionEvidence.requestId))
    .where(and(eq(taxpayerCorrectionEvidence.id, evidenceId), eq(taxpayerCorrectionRequest.assignedStaffId, staff.id))).limit(1);
  if (!evidence) return NextResponse.json({ error: "Evidence not found." }, { status: 404 });
  try {
    const blob = await get(evidence.path, { access: "private" });
    if (!blob || blob.statusCode !== 200 || !blob.stream || blob.blob.contentType !== "application/pdf" || blob.blob.size === null || blob.blob.size <= 0 || blob.blob.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Evidence is unavailable." }, { status: 404 });
    }
    const bytes = new Uint8Array(await new Response(blob.stream).arrayBuffer());
    if (bytes.length < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
      return NextResponse.json({ error: "Evidence is unavailable." }, { status: 404 });
    }
    await db.transaction(async (tx) => {
      await tx.insert(taxpayerCorrectionEvent).values({ requestId: evidence.requestId, actorUserId: session.user.id, eventType: "EVIDENCE_ACCESSED", details: { evidenceId } });
      await tx.insert(auditLog).values({ userId: session.user.id, action: "TAXPAYER_CORRECTION_EVIDENCE_ACCESSED", targetType: "taxpayer_correction_request", targetId: evidence.requestId, metadata: JSON.stringify({ evidenceId }) });
    });
    return new Response(bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    const reference = crypto.randomUUID();
    console.error("Authorized correction evidence retrieval failed", { reference, evidenceId, error });
    return NextResponse.json({ error: "Evidence could not be retrieved.", reference }, { status: 503 });
  }
}
