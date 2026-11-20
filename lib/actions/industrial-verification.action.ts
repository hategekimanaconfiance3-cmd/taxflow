"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import db from "@/db/drizzle";
import {
  industrialAlert,
  industrialBatchEvidence,
  industrialEvent,
  industrialVerificationResult,
  productionBatch,
} from "@/db/schema";
import { requireRRAPermission } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// Three-Way Production Reconciliation Engine
//
// Evidence pillars:
//   A. Declared quantity   → productionBatch.declaredQuantity (manufacturer pre-run plan)
//   B. Industrial quantity → industrialBatchEvidence.machineReportedQuantity
//   C. Reported quantity   → productionBatch.reportedGoodOutputQuantity + reportedRejectedOutputQuantity
//
// A discrepancy > threshold between any two pillars raises an industrialAlert.
// ---------------------------------------------------------------------------

const DEFAULT_THRESHOLD_BP = 500; // 5% = 500 basis points

function basisPointsDiff(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  if (a === 0) return 10000;
  return Math.round(Math.abs((b - a) / a) * 10000);
}

function pctDiff(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  if (a === 0) return 100;
  return parseFloat((Math.abs((b - a) / a) * 100).toFixed(2));
}

// ---------------------------------------------------------------------------
// Run reconciliation for a single batch (delegates to the service)
// ---------------------------------------------------------------------------

export async function reconcileBatch(batchId: string, tolerancePercent = 5) {
  const { verifyIndustrialBatch } = await import('@/lib/industrial-integration-service');
  const result = await verifyIndustrialBatch(batchId, tolerancePercent);
  return { success: true as const, data: result };
}

// ---------------------------------------------------------------------------
// Admin: Trigger reconciliation for all batches that have batch evidence
// ---------------------------------------------------------------------------

export async function runBulkReconciliation() {
  await requireRRAPermission("taxpayer.activity.read");

  const batchesWithEvidence = await db
    .selectDistinct({ batchId: industrialBatchEvidence.batchId })
    .from(industrialBatchEvidence);

  const results = [];
  for (const { batchId } of batchesWithEvidence) {
    if (!batchId) continue;
    try {
      const result = await reconcileBatch(batchId);
      results.push({ batchId, ...result });
    } catch (err) {
      results.push({ batchId, success: false, error: String(err) });
    }
  }

  const flagged = results.filter(r => r.success && 'data' in r && r.data?.worstOutcome === 'discrepant').length;
  const verified = results.filter(r => r.success && 'data' in r && r.data?.worstOutcome === 'matched').length;

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

  const evidence = await db
    .select()
    .from(industrialBatchEvidence)
    .where(eq(industrialBatchEvidence.batchId, batchId))
    .limit(1);

  const verificationResults = await db
    .select()
    .from(industrialVerificationResult)
    .where(eq(industrialVerificationResult.batchId, batchId))
    .orderBy(desc(industrialVerificationResult.checkedAt));

  if (evidence.length === 0 && verificationResults.length === 0) {
    // Trigger on-demand
    return reconcileBatch(batchId);
  }

  return { success: true as const, data: { evidence: evidence[0] ?? null, verificationResults } };
}

// ---------------------------------------------------------------------------
// Admin: List all verification results (most recent first)
// ---------------------------------------------------------------------------

export async function listProductionVerifications(opts?: { outcome?: string; limit?: number }) {
  await requireRRAPermission("taxpayer.activity.read");

  const rows = await db
    .select({
      id: industrialVerificationResult.id,
      batchId: industrialVerificationResult.batchId,
      batchReference: productionBatch.batchReference,
      comparisonKey: industrialVerificationResult.comparisonKey,
      outcome: industrialVerificationResult.outcome,
      machineQuantity: industrialVerificationResult.machineQuantity,
      declaredQuantity: industrialVerificationResult.declaredQuantity,
      varianceQuantity: industrialVerificationResult.varianceQuantity,
      tolerancePercent: industrialVerificationResult.tolerancePercent,
      reasonCodes: industrialVerificationResult.reasonCodes,
      checkedAt: industrialVerificationResult.checkedAt,
      createdAt: industrialVerificationResult.createdAt,
    })
    .from(industrialVerificationResult)
    .leftJoin(productionBatch, eq(productionBatch.id, industrialVerificationResult.batchId))
    .orderBy(desc(industrialVerificationResult.checkedAt))
    .limit(opts?.limit ?? 100);

  return { success: true as const, data: rows };
}

// ---------------------------------------------------------------------------
// Admin: Trigger manual reconciliation (server action wrapper)
// ---------------------------------------------------------------------------

export async function triggerBatchReconciliation(batchId: string) {
  await requireRRAPermission("taxpayer.activity.read");
  if (!batchId?.trim()) throw new Error('Batch ID is required.');
  return reconcileBatch(batchId, 2);
}
