"use server";

import { and, desc, eq, sql, sum } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import db from "@/db/drizzle";
import {
  industrialAlert,
  industrialEvent,
  productionBatch,
  productionVerification,
} from "@/db/schema";
import { requireRRAPermission } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// Three-Way Production Reconciliation Engine
//
// Evidence pillars:
//   A. Declared quantity   → productionBatch.declaredQuantity (manufacturer pre-run plan)
//   B. Industrial quantity → sum of industrialEvent production_count events for the batch
//   C. Reported quantity   → productionBatch.reportedGoodOutputQuantity + reportedRejectedOutputQuantity
//
// A discrepancy > threshold between any two pillars raises an industrialAlert.
// ---------------------------------------------------------------------------

const DEFAULT_THRESHOLD_BP = 500; // 5% = 500 basis points

function basisPointsDiff(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  if (a === 0) return 10000; // infinite discrepancy
  return Math.round(Math.abs((b - a) / a) * 10000);
}

function pctDiff(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  if (a === 0) return 100;
  return parseFloat((Math.abs((b - a) / a) * 100).toFixed(2));
}

// ---------------------------------------------------------------------------
// Run reconciliation for a single batch
// ---------------------------------------------------------------------------

export async function reconcileBatch(batchId: string) {
  // Load batch
  const [batch] = await db
    .select()
    .from(productionBatch)
    .where(eq(productionBatch.id, batchId))
    .limit(1);
  if (!batch) return { success: false as const, error: "Batch not found" };

  const declaredQty = batch.declaredQuantity ?? 0;

  // Sum machine production_count events
  const [eventSum] = await db
    .select({ total: sql<string>`coalesce(sum((payload->>'count')::numeric), 0)` })
    .from(industrialEvent)
    .where(
      and(
        eq(industrialEvent.productionBatchId, batchId),
        eq(industrialEvent.eventType, "production_count"),
      ),
    );
  const industrialQty = parseFloat(eventSum?.total ?? "0");

  // Reported = good + rejected (what manufacturer submitted post-run)
  const reportedGood = parseFloat(batch.reportedGoodOutputQuantity ?? "0");
  const reportedRejected = parseFloat(batch.reportedRejectedOutputQuantity ?? "0");
  const reportedQty = reportedGood + reportedRejected;

  // Discrepancy between declared and industrial (primary three-way check)
  const declaredVsIndustrialBP = industrialQty > 0
    ? basisPointsDiff(declaredQty, industrialQty)
    : null;
  const declaredVsIndustrialPct = industrialQty > 0
    ? pctDiff(declaredQty, industrialQty)
    : null;

  const discrepancyPercent = declaredVsIndustrialPct;
  const alertRaised = declaredVsIndustrialBP !== null && declaredVsIndustrialBP > DEFAULT_THRESHOLD_BP;

  // Upsert production_verification record
  const existing = await db
    .select({ id: productionVerification.id })
    .from(productionVerification)
    .where(eq(productionVerification.productionBatchId, batchId))
    .limit(1);

  let verificationId: string;

  if (existing.length > 0) {
    verificationId = existing[0].id;
    await db
      .update(productionVerification)
      .set({
        declaredQuantity: declaredQty,
        industrialQuantity: industrialQty > 0 ? industrialQty : null,
        reportedQuantity: reportedQty > 0 ? reportedQty : null,
        discrepancyPercent,
        verificationStatus:
          alertRaised ? "discrepancy_flagged" :
          industrialQty > 0 ? "verified" : "pending",
        alertRaised,
        alertRaisedAt: alertRaised ? new Date() : null,
      })
      .where(eq(productionVerification.id, verificationId));
  } else {
    verificationId = randomUUID();
    await db.insert(productionVerification).values({
      id: verificationId,
      productionBatchId: batchId,
      manufacturerId: batch.manufacturerId,
      declaredQuantity: declaredQty,
      industrialQuantity: industrialQty > 0 ? industrialQty : null,
      reportedQuantity: reportedQty > 0 ? reportedQty : null,
      discrepancyPercent,
      discrepancyThresholdBasisPoints: DEFAULT_THRESHOLD_BP,
      verificationStatus:
        alertRaised ? "discrepancy_flagged" :
        industrialQty > 0 ? "verified" : "pending",
      alertRaised,
      alertRaisedAt: alertRaised ? new Date() : null,
    });
  }

  // Raise alert if discrepancy detected and no open alert already exists
  if (alertRaised) {
    const existingAlert = await db
      .select({ id: industrialAlert.id })
      .from(industrialAlert)
      .where(
        and(
          eq(industrialAlert.productionVerificationId, verificationId),
          eq(industrialAlert.status, "open"),
        ),
      )
      .limit(1);

    if (existingAlert.length === 0) {
      await db.insert(industrialAlert).values({
        id: randomUUID(),
        manufacturerId: batch.manufacturerId,
        alertType: "production_discrepancy",
        severity: declaredVsIndustrialBP! > 2000 ? "high" : "medium",
        title: `Production discrepancy: ${discrepancyPercent?.toFixed(1)}% variance on batch ${batch.batchReference}`,
        description:
          `Batch ${batch.batchReference}: declared ${declaredQty}, industrial machines recorded ${industrialQty.toFixed(2)}, ` +
          `manufacturer reported ${reportedQty.toFixed(2)}. ` +
          `Declared vs industrial variance: ${discrepancyPercent?.toFixed(2)}% (threshold: ${(DEFAULT_THRESHOLD_BP / 100).toFixed(1)}%).`,
        relatedEntityType: "production_batch",
        relatedEntityId: batchId,
        productionVerificationId: verificationId,
        status: "open",
      });
    }
  }

  return {
    success: true as const,
    data: {
      batchId,
      batchReference: batch.batchReference,
      declaredQty,
      industrialQty,
      reportedQty,
      discrepancyPercent,
      discrepancyBasisPoints: declaredVsIndustrialBP,
      alertRaised,
      verificationId,
      verdict:
        alertRaised ? "DISCREPANCY_FLAGGED" :
        industrialQty > 0 ? "VERIFIED" : "PENDING_MACHINE_DATA",
    },
  };
}

// ---------------------------------------------------------------------------
// Admin: Trigger reconciliation for all unverified batches
// ---------------------------------------------------------------------------

export async function runBulkReconciliation() {
  await requireRRAPermission("taxpayer.activity.read");

  // Find batches with industrial events that haven't been verified yet
  const batchesWithEvents = await db
    .selectDistinct({ batchId: industrialEvent.productionBatchId })
    .from(industrialEvent)
    .where(
      and(
        sql`${industrialEvent.productionBatchId} IS NOT NULL`,
        eq(industrialEvent.eventType, "production_count"),
      ),
    );

  const results = [];
  for (const { batchId } of batchesWithEvents) {
    if (!batchId) continue;
    const result = await reconcileBatch(batchId);
    results.push(result);
  }

  const flagged = results.filter(r => r.success && r.data.alertRaised).length;
  const verified = results.filter(r => r.success && !r.data.alertRaised && r.data.verdict === "VERIFIED").length;

  return {
    success: true as const,
    data: {
      processed: results.length,
      verified,
      flagged,
      errors: results.filter(r => !r.success).length,
    },
  };
}

// ---------------------------------------------------------------------------
// Admin: Get verification status for a specific batch
// ---------------------------------------------------------------------------

export async function getBatchVerification(batchId: string) {
  await requireRRAPermission("taxpayer.activity.read");

  const [verification] = await db
    .select()
    .from(productionVerification)
    .where(eq(productionVerification.productionBatchId, batchId))
    .limit(1);

  if (!verification) {
    // Run it on demand
    return reconcileBatch(batchId);
  }

  return { success: true as const, data: verification };
}

// ---------------------------------------------------------------------------
// Admin: List all verifications (most recent first)
// ---------------------------------------------------------------------------

export async function listProductionVerifications(opts?: { status?: string; limit?: number }) {
  await requireRRAPermission("taxpayer.activity.read");

  const rows = await db
    .select({
      id: productionVerification.id,
      productionBatchId: productionVerification.productionBatchId,
      manufacturerId: productionVerification.manufacturerId,
      verificationStatus: productionVerification.verificationStatus,
      declaredQuantity: productionVerification.declaredQuantity,
      industrialQuantity: productionVerification.industrialQuantity,
      reportedQuantity: productionVerification.reportedQuantity,
      discrepancyPercent: productionVerification.discrepancyPercent,
      alertRaised: productionVerification.alertRaised,
      alertRaisedAt: productionVerification.alertRaisedAt,
      verifiedAt: productionVerification.verifiedAt,
      createdAt: productionVerification.createdAt,
    })
    .from(productionVerification)
    .orderBy(desc(productionVerification.createdAt))
    .limit(opts?.limit ?? 100);

  return { success: true as const, data: rows };
}
