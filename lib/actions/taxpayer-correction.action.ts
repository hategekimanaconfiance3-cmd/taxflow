"use server";

import "server-only";
import { createHash } from "node:crypto";
import { get } from "@vercel/blob";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import db from "@/db/drizzle";
import {
  auditLog, notification, rraStaff, rraStaffRole, taxpayerCorrectionEvent,
  taxpayerCorrectionEvidence, taxpayerCorrectionRequest, user,
} from "@/db/schema";
import { requireRRAPermission, requireTraderSession } from "@/lib/auth-guard";
import { hasRRAPermission, isRRARole } from "@/lib/rra-rbac";

const MAX_EVIDENCE = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const fieldKeys = ["name", "businessName", "email", "phoneNumber", "businessType"] as const;
type CorrectionField = (typeof fieldKeys)[number];
const fieldSchema = z.enum(fieldKeys);
const submissionSchema = z.object({
  submissionKey: z.string().uuid(),
  fieldKey: fieldSchema,
  requestedValue: z.string().trim().min(1).max(500),
  reason: z.string().trim().min(10).max(2000),
  evidencePathnames: z.array(z.string().trim().min(1).max(300)).max(MAX_EVIDENCE).default([]),
}).strict();
const commentSchema = z.object({ requestId: z.string().uuid(), comment: z.string().trim().min(1).max(2000) }).strict();
const evidenceRequestSchema = z.object({ requestId: z.string().uuid(), reason: z.string().trim().min(10).max(2000) }).strict();
const recommendationSchema = z.object({ requestId: z.string().uuid(), recommendation: z.enum(["RECOMMEND_APPROVAL", "RECOMMEND_REJECTION"]), reason: z.string().trim().min(10).max(2000) }).strict();
const assignmentSchema = z.object({ requestId: z.string().uuid(), staffRecordId: z.string().uuid(), reason: z.string().trim().min(10).max(1000) }).strict();

function safeValue(userRecord: typeof user.$inferSelect, field: CorrectionField): string {
  const value = userRecord[field];
  return value === null || value === undefined ? "" : String(value);
}

function privateEvidencePrefix(userId: string): string {
  // A non-reversible opaque actor scope keeps user IDs out of Blob paths.
  return createHash("sha256").update(userId).digest("hex").slice(0, 24);
}

/** Return a server-scoped private PDF pathname for this taxpayer's upload. */
export async function createCorrectionEvidenceUploadPath(): Promise<string> {
  const session = await requireTraderSession();
  return `taxpayer-corrections/${privateEvidencePrefix(session.user.id)}/${crypto.randomUUID()}.pdf`;
}

async function inspectPrivateEvidence(pathname: string, taxpayerId: string): Promise<{ filename: string; size: number }> {
  const safePattern = new RegExp(`^taxpayer-corrections/${privateEvidencePrefix(taxpayerId)}/[0-9a-f-]{36}\\.pdf$`, "i");
  if (!safePattern.test(pathname)) throw new Error("An evidence file is not valid for this taxpayer.");
  const blob = await get(pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200 || !blob.stream || blob.blob.contentType !== "application/pdf" ||
      blob.blob.size === null || blob.blob.size <= 0 || blob.blob.size > MAX_FILE_SIZE) {
    throw new Error("Upload a valid PDF file no larger than 10 MB.");
  }
  const bytes = new Uint8Array(await new Response(blob.stream).arrayBuffer());
  if (bytes.length < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
    throw new Error("The uploaded evidence is not a valid PDF.");
  }
  return { filename: pathname.slice(pathname.lastIndexOf("/") + 1), size: bytes.length };
}

export async function submitTaxpayerCorrectionRequest(input: unknown): Promise<{ success: true; reference: string }> {
  const parsed = submissionSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Correction request details are invalid.");
  const session = await requireTraderSession();
  const [taxpayer] = await db.select().from(user).where(eq(user.id, session.user.id)).limit(1);
  if (!taxpayer || !taxpayer.isActive) throw new Error("An active taxpayer account is required.");
  const [previousSubmission] = await db.select({ reference: taxpayerCorrectionRequest.reference }).from(taxpayerCorrectionRequest)
    .where(and(eq(taxpayerCorrectionRequest.taxpayerId, taxpayer.id), eq(taxpayerCorrectionRequest.submissionKey, parsed.data.submissionKey))).limit(1);
  if (previousSubmission) return { success: true, reference: previousSubmission.reference };
  const originalValue = safeValue(taxpayer, parsed.data.fieldKey);
  if (originalValue === parsed.data.requestedValue) throw new Error("The requested value must differ from the current value.");

  const evidenceFiles = await Promise.all(parsed.data.evidencePathnames.map((pathname) => inspectPrivateEvidence(pathname, taxpayer.id)));
  const requestId = crypto.randomUUID();
  const reference = `COR-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const createdAt = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(taxpayerCorrectionRequest).values({
      id: requestId, reference, taxpayerId: taxpayer.id, submissionKey: parsed.data.submissionKey,
      category: ["name", "email", "phoneNumber"].includes(parsed.data.fieldKey) ? "personal_identity" : "business_profile",
      fieldKey: parsed.data.fieldKey, originalValue, requestedValue: parsed.data.requestedValue,
      reason: parsed.data.reason, status: "submitted", createdAt, updatedAt: createdAt,
    });
    if (evidenceFiles.length) await tx.insert(taxpayerCorrectionEvidence).values(parsed.data.evidencePathnames.map((blobPathname, index) => ({
      id: crypto.randomUUID(), requestId, uploaderUserId: taxpayer.id, blobPathname,
      filename: evidenceFiles[index]!.filename, sizeBytes: evidenceFiles[index]!.size, contentType: "application/pdf",
    })));
    await tx.insert(taxpayerCorrectionEvent).values({
      requestId, actorUserId: taxpayer.id, eventType: "REQUEST_SUBMITTED", toStatus: "submitted",
      reason: parsed.data.reason, details: { fieldKey: parsed.data.fieldKey, evidenceCount: evidenceFiles.length },
    });
    await tx.insert(auditLog).values({
      userId: taxpayer.id, action: "TAXPAYER_CORRECTION_SUBMITTED", targetType: "taxpayer_correction_request", targetId: requestId,
      metadata: JSON.stringify({ reference, fieldKey: parsed.data.fieldKey, evidenceCount: evidenceFiles.length }),
    });
    const roleAssignments = await tx.select({ staffId: rraStaff.id, userId: rraStaff.userId, clearanceLevel: rraStaff.clearanceLevel, role: rraStaffRole.role })
      .from(rraStaff).innerJoin(user, eq(user.id, rraStaff.userId))
      .leftJoin(rraStaffRole, eq(rraStaffRole.staffRecordId, rraStaff.id))
      .where(and(eq(rraStaff.isActive, true), eq(user.isActive, true), eq(user.role, "rra_staff")));
    const assignmentQueueUserIds = [...new Set(roleAssignments.filter((staff) => {
      return staff.role ? staff.role === "super_admin" : staff.clearanceLevel === "super_admin";
    }).map((staff) => staff.userId))];
    if (assignmentQueueUserIds.length) await tx.insert(notification).values(assignmentQueueUserIds.map((userId) => ({
      userId, type: "taxpayer_correction_assignment", title: "Taxpayer correction request needs assignment",
      message: "A new taxpayer correction request is waiting in the authorized assignment queue.", link: "/admin/corrections",
    })));
  });
  return { success: true, reference };
}

export async function getMyTaxpayerCorrectionRequests() {
  const session = await requireTraderSession();
  const requests = await db.select({
    id: taxpayerCorrectionRequest.id, reference: taxpayerCorrectionRequest.reference,
    fieldKey: taxpayerCorrectionRequest.fieldKey, originalValue: taxpayerCorrectionRequest.originalValue,
    requestedValue: taxpayerCorrectionRequest.requestedValue, reason: taxpayerCorrectionRequest.reason,
    status: taxpayerCorrectionRequest.status, createdAt: taxpayerCorrectionRequest.createdAt,
  }).from(taxpayerCorrectionRequest).where(eq(taxpayerCorrectionRequest.taxpayerId, session.user.id))
    .orderBy(desc(taxpayerCorrectionRequest.createdAt));
  if (!requests.length) return [];
  const evidenceRequests = await db.select({ requestId: taxpayerCorrectionEvent.requestId, reason: taxpayerCorrectionEvent.reason })
    .from(taxpayerCorrectionEvent).where(and(inArray(taxpayerCorrectionEvent.requestId, requests.map((item) => item.id)), eq(taxpayerCorrectionEvent.eventType, "ADDITIONAL_EVIDENCE_REQUESTED")))
    .orderBy(desc(taxpayerCorrectionEvent.createdAt));
  const latestReason = new Map<string, string>();
  for (const event of evidenceRequests) if (event.reason && !latestReason.has(event.requestId)) latestReason.set(event.requestId, event.reason);
  return requests.map((item) => ({ ...item, evidenceRequestReason: latestReason.get(item.id) ?? null }));
}

export async function getCorrectionOfficerWorkspace() {
  const session = await requireRRAPermission("taxpayer.correction.read_assigned");
  const cases = await db.select({
    id: taxpayerCorrectionRequest.id, reference: taxpayerCorrectionRequest.reference,
    taxpayerId: taxpayerCorrectionRequest.taxpayerId, taxpayerName: user.name, tin: user.tinNumber,
    businessName: user.businessName, fieldKey: taxpayerCorrectionRequest.fieldKey,
    originalValue: taxpayerCorrectionRequest.originalValue, requestedValue: taxpayerCorrectionRequest.requestedValue,
    reason: taxpayerCorrectionRequest.reason, status: taxpayerCorrectionRequest.status,
    recommendation: taxpayerCorrectionRequest.recommendation, recommendationReason: taxpayerCorrectionRequest.recommendationReason,
    createdAt: taxpayerCorrectionRequest.createdAt, updatedAt: taxpayerCorrectionRequest.updatedAt,
  }).from(taxpayerCorrectionRequest).innerJoin(user, eq(user.id, taxpayerCorrectionRequest.taxpayerId))
    .where(eq(taxpayerCorrectionRequest.assignedStaffId, session.staff.id))
    .orderBy(desc(taxpayerCorrectionRequest.updatedAt));
  const counts = {
    assigned: cases.length,
    new: cases.filter((item) => item.status === "under_review" && item.recommendation === null).length,
    awaitingEvidence: cases.filter((item) => item.status === "awaiting_evidence").length,
    recommended: cases.filter((item) => item.status.startsWith("recommended_")).length,
    overdue: cases.filter((item) => Date.now() - item.createdAt.getTime() > 14 * 24 * 60 * 60 * 1000 && !item.status.startsWith("recommended_")).length,
  };
  return { cases, counts };
}

export async function getCorrectionAssignmentQueue() {
  await requireRRAPermission("taxpayer.correction.assign");
  return db.select({
    id: taxpayerCorrectionRequest.id, reference: taxpayerCorrectionRequest.reference,
    taxpayerName: user.name, tin: user.tinNumber, fieldKey: taxpayerCorrectionRequest.fieldKey,
    status: taxpayerCorrectionRequest.status, createdAt: taxpayerCorrectionRequest.createdAt,
  }).from(taxpayerCorrectionRequest).innerJoin(user, eq(user.id, taxpayerCorrectionRequest.taxpayerId))
    .where(isNull(taxpayerCorrectionRequest.assignedStaffId)).orderBy(desc(taxpayerCorrectionRequest.createdAt));
}

export async function getAssignedCorrectionRequest(requestId: string) {
  const parsedId = z.string().uuid().safeParse(requestId);
  if (!parsedId.success) throw new Error("Correction request not found.");
  const session = await requireRRAPermission("taxpayer.correction.read_assigned");
  const [item] = await db.select({
    request: taxpayerCorrectionRequest,
    taxpayerName: user.name, tin: user.tinNumber, businessName: user.businessName,
  }).from(taxpayerCorrectionRequest).innerJoin(user, eq(user.id, taxpayerCorrectionRequest.taxpayerId))
    .where(and(eq(taxpayerCorrectionRequest.id, parsedId.data), eq(taxpayerCorrectionRequest.assignedStaffId, session.staff.id))).limit(1);
  if (!item) throw new Error("Correction request not found.");
  const events = await db.select().from(taxpayerCorrectionEvent).where(eq(taxpayerCorrectionEvent.requestId, parsedId.data)).orderBy(taxpayerCorrectionEvent.createdAt);
  const evidence = session.staff.clearanceRoles.some((role) => hasRRAPermission(role, "taxpayer.correction.read_evidence"))
    ? await db.select({ id: taxpayerCorrectionEvidence.id, filename: taxpayerCorrectionEvidence.filename, sizeBytes: taxpayerCorrectionEvidence.sizeBytes, createdAt: taxpayerCorrectionEvidence.createdAt })
      .from(taxpayerCorrectionEvidence).where(eq(taxpayerCorrectionEvidence.requestId, parsedId.data)).orderBy(taxpayerCorrectionEvidence.createdAt)
    : [];
  return { ...item, events, evidence };
}

async function requireAssignedRequest(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], requestId: string, staffId: string) {
  const [row] = await tx.select().from(taxpayerCorrectionRequest)
    .where(and(eq(taxpayerCorrectionRequest.id, requestId), eq(taxpayerCorrectionRequest.assignedStaffId, staffId)))
    .for("update").limit(1);
  if (!row) throw new Error("Assigned correction request not found.");
  return row;
}

export async function addCorrectionReviewComment(input: unknown): Promise<{ success: true }> {
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Review comment is invalid.");
  const session = await requireRRAPermission("taxpayer.correction.add_review_comment");
  await db.transaction(async (tx) => {
    const item = await requireAssignedRequest(tx, parsed.data.requestId, session.staff.id);
    if (!["under_review", "awaiting_evidence"].includes(item.status)) throw new Error("This request is no longer open for review comments.");
    await tx.insert(taxpayerCorrectionEvent).values({ requestId: item.id, actorUserId: session.user.id, eventType: "REVIEW_COMMENT_ADDED", fromStatus: item.status, toStatus: item.status, reason: parsed.data.comment });
    await tx.insert(auditLog).values({ userId: session.user.id, action: "TAXPAYER_CORRECTION_COMMENT_ADDED", targetType: "taxpayer_correction_request", targetId: item.id });
  });
  return { success: true };
}

export async function requestCorrectionEvidence(input: unknown): Promise<{ success: true }> {
  const parsed = evidenceRequestSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Evidence request is invalid.");
  const session = await requireRRAPermission("taxpayer.correction.request_evidence");
  await db.transaction(async (tx) => {
    const item = await requireAssignedRequest(tx, parsed.data.requestId, session.staff.id);
    if (!["under_review", "awaiting_evidence"].includes(item.status)) throw new Error("This request is not available for an evidence request.");
    await tx.update(taxpayerCorrectionRequest).set({ status: "awaiting_evidence", updatedAt: new Date() }).where(eq(taxpayerCorrectionRequest.id, item.id));
    await tx.insert(taxpayerCorrectionEvent).values({ requestId: item.id, actorUserId: session.user.id, eventType: "ADDITIONAL_EVIDENCE_REQUESTED", fromStatus: item.status, toStatus: "awaiting_evidence", reason: parsed.data.reason });
    await tx.insert(notification).values({ userId: item.taxpayerId, type: "taxpayer_correction_evidence_requested", title: "More information is needed for your correction request", message: "Please open your correction request to review the requested information.", link: "/dashboard/corrections" });
    await tx.insert(auditLog).values({ userId: session.user.id, action: "TAXPAYER_CORRECTION_EVIDENCE_REQUESTED", targetType: "taxpayer_correction_request", targetId: item.id });
  });
  return { success: true };
}

export async function submitAdditionalCorrectionEvidence(input: unknown): Promise<{ success: true }> {
  const parsed = z.object({ requestId: z.string().uuid(), evidencePathnames: z.array(z.string().trim().min(1).max(300)).min(1).max(MAX_EVIDENCE) }).strict().safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Evidence details are invalid.");
  const session = await requireTraderSession();
  const files = await Promise.all(parsed.data.evidencePathnames.map((pathname) => inspectPrivateEvidence(pathname, session.user.id)));
  await db.transaction(async (tx) => {
    const [item] = await tx.select().from(taxpayerCorrectionRequest)
      .where(and(eq(taxpayerCorrectionRequest.id, parsed.data.requestId), eq(taxpayerCorrectionRequest.taxpayerId, session.user.id)))
      .for("update").limit(1);
    if (!item || item.status !== "awaiting_evidence") throw new Error("Correction request is not awaiting taxpayer evidence.");
    await tx.insert(taxpayerCorrectionEvidence).values(parsed.data.evidencePathnames.map((blobPathname, index) => ({
      id: crypto.randomUUID(), requestId: item.id, uploaderUserId: session.user.id, blobPathname,
      filename: files[index]!.filename, sizeBytes: files[index]!.size, contentType: "application/pdf",
    })));
    await tx.update(taxpayerCorrectionRequest).set({ status: "under_review", updatedAt: new Date() }).where(eq(taxpayerCorrectionRequest.id, item.id));
    await tx.insert(taxpayerCorrectionEvent).values({ requestId: item.id, actorUserId: session.user.id, eventType: "ADDITIONAL_EVIDENCE_SUBMITTED", fromStatus: "awaiting_evidence", toStatus: "under_review", details: { evidenceCount: files.length } });
    await tx.insert(auditLog).values({ userId: session.user.id, action: "TAXPAYER_CORRECTION_EVIDENCE_SUBMITTED", targetType: "taxpayer_correction_request", targetId: item.id, metadata: JSON.stringify({ evidenceCount: files.length }) });
    if (item.assignedStaffId) {
      const [assignedStaff] = await tx.select({ userId: rraStaff.userId }).from(rraStaff).where(eq(rraStaff.id, item.assignedStaffId)).limit(1);
      if (assignedStaff) await tx.insert(notification).values({ userId: assignedStaff.userId, type: "taxpayer_correction_evidence_received", title: "Additional correction evidence received", message: "The taxpayer submitted information for an assigned correction request.", link: `/admin/corrections/${item.id}` });
    }
  });
  return { success: true };
}

export async function recommendTaxpayerCorrection(input: unknown): Promise<{ success: true }> {
  const parsed = recommendationSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Recommendation is invalid.");
  const session = await requireRRAPermission("taxpayer.correction.recommend");
  await db.transaction(async (tx) => {
    const item = await requireAssignedRequest(tx, parsed.data.requestId, session.staff.id);
    if (item.status !== "under_review" || item.recommendation !== null) throw new Error("This request cannot receive another recommendation.");
    const toStatus = parsed.data.recommendation === "RECOMMEND_APPROVAL" ? "recommended_approval" : "recommended_rejection";
    await tx.update(taxpayerCorrectionRequest).set({ status: toStatus, recommendation: parsed.data.recommendation, recommendationReason: parsed.data.reason, updatedAt: new Date() }).where(eq(taxpayerCorrectionRequest.id, item.id));
    await tx.insert(taxpayerCorrectionEvent).values({ requestId: item.id, actorUserId: session.user.id, eventType: parsed.data.recommendation, fromStatus: item.status, toStatus, reason: parsed.data.reason });
    await tx.insert(auditLog).values({ userId: session.user.id, action: "TAXPAYER_CORRECTION_RECOMMENDED", targetType: "taxpayer_correction_request", targetId: item.id, metadata: JSON.stringify({ recommendation: parsed.data.recommendation }) });
  });
  return { success: true };
}

export async function assignTaxpayerCorrectionRequest(input: unknown): Promise<{ success: true }> {
  const parsed = assignmentSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Assignment details are invalid.");
  const session = await requireRRAPermission("taxpayer.correction.assign");
  await db.transaction(async (tx) => {
    const [item] = await tx.select().from(taxpayerCorrectionRequest).where(eq(taxpayerCorrectionRequest.id, parsed.data.requestId)).for("update").limit(1);
    const [target] = await tx.select({ id: rraStaff.id, userId: rraStaff.userId, clearanceLevel: rraStaff.clearanceLevel })
      .from(rraStaff).innerJoin(user, eq(user.id, rraStaff.userId))
      .where(and(eq(rraStaff.id, parsed.data.staffRecordId), eq(rraStaff.isActive, true), eq(user.isActive, true), eq(user.role, "rra_staff"))).limit(1);
    if (!item || !target) throw new Error("Correction request or eligible officer not found.");
    if (!["submitted", "under_review", "awaiting_evidence"].includes(item.status)) throw new Error("A request with a recorded recommendation cannot be reassigned.");
    if (target.userId === session.user.id) throw new Error("Self-assignment is not permitted.");
    const targetRoleRows = await tx.select({ role: rraStaffRole.role }).from(rraStaffRole).where(eq(rraStaffRole.staffRecordId, target.id));
    const targetRoles = (targetRoleRows.length ? targetRoleRows.map((row) => row.role) : [target.clearanceLevel]).filter(isRRARole);
    if (!targetRoles.includes("correction_officer")) throw new Error("Choose an active Correction Officer.");
    const previousStatus = item.status;
    await tx.update(taxpayerCorrectionRequest).set({ assignedStaffId: target.id, status: "under_review", updatedAt: new Date() }).where(eq(taxpayerCorrectionRequest.id, item.id));
    await tx.insert(taxpayerCorrectionEvent).values({ requestId: item.id, actorUserId: session.user.id, eventType: item.assignedStaffId ? "REQUEST_REASSIGNED" : "REQUEST_ASSIGNED", fromStatus: previousStatus, toStatus: "under_review", reason: parsed.data.reason, details: { assignedStaffId: target.id } });
    await tx.insert(notification).values({ userId: target.userId, type: "taxpayer_correction_assigned", title: "Taxpayer correction request assigned", message: "A correction request has been assigned to your review queue.", link: "/admin/corrections" });
    await tx.insert(auditLog).values({ userId: session.user.id, action: "TAXPAYER_CORRECTION_ASSIGNED", targetType: "taxpayer_correction_request", targetId: item.id, metadata: JSON.stringify({ assignedStaffRecordId: target.id }) });
  });
  return { success: true };
}

export async function listActiveCorrectionOfficers() {
  await requireRRAPermission("taxpayer.correction.assign");
  const rows = await db.select({ id: rraStaff.id, name: user.name, staffId: rraStaff.staffId, clearanceLevel: rraStaff.clearanceLevel })
    .from(rraStaff).innerJoin(user, eq(user.id, rraStaff.userId)).leftJoin(rraStaffRole, eq(rraStaffRole.staffRecordId, rraStaff.id))
    .where(and(eq(rraStaff.isActive, true), eq(user.isActive, true), eq(user.role, "rra_staff")));
  if (!rows.length) return [];
  const roles = await db.select({ staffRecordId: rraStaffRole.staffRecordId, role: rraStaffRole.role }).from(rraStaffRole).where(inArray(rraStaffRole.staffRecordId, rows.map((row) => row.id).filter(Boolean)));
  const roleMap = new Map<string, string[]>();
  for (const row of roles) roleMap.set(row.staffRecordId, [...(roleMap.get(row.staffRecordId) ?? []), row.role]);
  return rows.filter((row) => (roleMap.get(row.id)?.length ? roleMap.get(row.id)!.includes("correction_officer") : row.clearanceLevel === "correction_officer"))
    .map(({ id, name, staffId }) => ({ id, name, staffId }));
}
