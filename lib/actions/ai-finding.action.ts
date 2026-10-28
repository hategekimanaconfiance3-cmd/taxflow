"use server";

import { and, desc, eq, gte, isNotNull, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { createHash } from "node:crypto";
import db from "@/db/drizzle";
import { aiAuditLog, aiFinding, auditLog, productionBatch, user } from "@/db/schema";
import { requireRRAPermission, requireRRASession } from "@/lib/auth-guard";
import { reconcileAndCreateFindings } from "@/lib/ai/reconciliation";
import { getProductionHistoryAnalysis } from "@/lib/ai/production-history-service";
import { PRODUCTION_HISTORY_RULE_VERSION } from "@/lib/ai/production-history-baseline";
import { hasRRAPermission } from "@/lib/rra-rbac";

export type FindingSeverity = "info" | "low" | "medium" | "high" | "warning" | "critical";
export type FindingStatus = "open" | "under_review" | "resolved" | "dismissed";
export type FindingType =
  | "inventory_discrepancy"
  | "stock_discrepancy"
  | "underreporting"
  | "price_anomaly"
  | "tax_gap"
  | "duplicate_transaction"
  | "supply_chain_gap"
  | "data_quality"
  | "risk_score"
  | "dispatch_mismatch"
  | "unusual_quantity"
  | "tax_inconsistency"
  | "production_discrepancy";

export interface AiFinding {
  id: string;
  findingType: FindingType;
  severity: FindingSeverity;
  reviewStatus: FindingStatus;
  businessId: string | null;
  businessName: string | null;
  tinNumber: string | null;
  productId: string | null;
  observedValue: number | null;
  expectedValue: number | null;
  difference: number | null;
  explanation: string;
  evidenceRefs: string | null;
  affectedTransactionIds: string | null;
  resolutionNotes: string | null;
  resolvedById: string | null;
  resolvedNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FindingStats {
  total: number;
  open: number;
  critical: number;
  underReview: number;
  highRiskBusinesses: number;
  dataQualityIssues: number;
  lastScanAt: Date | null;
}

export interface FindingFilters {
  findingType?: FindingType;
  severity?: FindingSeverity;
  reviewStatus?: FindingStatus;
  businessId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}

const findingFiltersSchema = z.object({
  findingType: z.string().max(64).optional(),
  severity: z.string().max(32).optional(),
  reviewStatus: z.enum(["open", "under_review", "resolved", "dismissed"]).optional(),
  businessId: z.string().min(1).max(128).optional(),
  dateFrom: z.date().optional(),
  dateTo: z.date().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(100_000).optional(),
});

const updateFindingSchema = z.object({
  findingId: z.string().min(1).max(128),
  newStatus: z.enum(["open", "under_review", "resolved", "dismissed"]),
  note: z.string().trim().max(2_000).optional(),
});

export async function getFindingStats(): Promise<FindingStats> {
  await requireRRASession("super_admin", "compliance_officer", "audit_officer", "audit_investigation_officer", "data_ai_analyst");

  const [row] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      open: sql<number>`COUNT(*) FILTER (WHERE ${aiFinding.reviewStatus} = 'open')::int`,
      critical: sql<number>`COUNT(*) FILTER (WHERE ${aiFinding.severity} = 'critical')::int`,
      underReview: sql<number>`COUNT(*) FILTER (WHERE ${aiFinding.reviewStatus} = 'under_review')::int`,
      highRiskBusinesses: sql<number>`COUNT(DISTINCT ${aiFinding.businessId}) FILTER (WHERE ${aiFinding.severity} IN ('high','critical'))::int`,
      dataQualityIssues: sql<number>`COUNT(*) FILTER (WHERE ${aiFinding.findingType} = 'data_quality')::int`,
    })
    .from(aiFinding);
  const [lastScan] = await db
    .select({ createdAt: aiAuditLog.createdAt })
    .from(aiAuditLog)
    .where(eq(aiAuditLog.taskType, "reconciliation"))
    .orderBy(desc(aiAuditLog.createdAt))
    .limit(1);

  return {
    total: row?.total ?? 0,
    open: row?.open ?? 0,
    critical: row?.critical ?? 0,
    underReview: row?.underReview ?? 0,
    highRiskBusinesses: row?.highRiskBusinesses ?? 0,
    dataQualityIssues: row?.dataQualityIssues ?? 0,
    lastScanAt: lastScan?.createdAt ?? null,
  };
}

export async function getFindings(filters: FindingFilters = {}): Promise<AiFinding[]> {
  const { staff } = await requireRRASession("super_admin", "compliance_officer", "audit_officer", "audit_investigation_officer", "data_ai_analyst");
  const canReadFormula = staff.clearanceRoles.some((role) => role !== "super_admin" && hasRRAPermission(role, "production.formula.read"));
  const parsed = findingFiltersSchema.safeParse(filters);
  if (!parsed.success) throw new Error("Invalid finding filters.");
  const values = parsed.data;

  const conditions = [
    values.findingType ? eq(aiFinding.findingType, values.findingType) : undefined,
    values.severity ? eq(aiFinding.severity, values.severity) : undefined,
    values.reviewStatus ? eq(aiFinding.reviewStatus, values.reviewStatus) : undefined,
    values.businessId ? eq(aiFinding.businessId, values.businessId) : undefined,
    values.dateFrom ? gte(aiFinding.createdAt, values.dateFrom) : undefined,
    values.dateTo ? lte(aiFinding.createdAt, values.dateTo) : undefined,
  ].filter((condition): condition is SQL => condition !== undefined);

  const rows = await db
    .select({
      id: aiFinding.id,
      findingType: aiFinding.findingType,
      severity: aiFinding.severity,
      reviewStatus: aiFinding.reviewStatus,
      businessId: aiFinding.businessId,
      businessName: user.businessName,
      name: user.name,
      tinNumber: user.tinNumber,
      productId: aiFinding.productId,
      observedValue: aiFinding.observedValue,
      expectedValue: aiFinding.expectedValue,
      difference: aiFinding.difference,
      explanation: aiFinding.explanation,
      evidenceRefs: aiFinding.evidenceRefs,
      transactionIds: aiFinding.transactionIds,
      resolutionNotes: aiFinding.resolutionNotes,
      createdAt: aiFinding.createdAt,
      updatedAt: aiFinding.updatedAt,
    })
    .from(aiFinding)
    .leftJoin(user, eq(aiFinding.businessId, user.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(aiFinding.createdAt))
    .limit(values.limit ?? 20)
    .offset(values.offset ?? 0);

  return rows.map((row) => ({
    ...row,
    findingType: row.findingType as FindingType,
    severity: row.severity as FindingSeverity,
    reviewStatus: row.reviewStatus as FindingStatus,
    businessName: row.businessName ?? row.name ?? null,
    evidenceRefs: row.findingType === "production_discrepancy" && !canReadFormula ? null : row.evidenceRefs,
    resolutionNotes: row.findingType === "production_discrepancy" && !canReadFormula ? null : row.resolutionNotes,
    affectedTransactionIds: row.transactionIds,
    resolvedById: null,
    resolvedNote: row.findingType === "production_discrepancy" && !canReadFormula ? null : row.resolutionNotes,
  }));
}

export async function getFindingById(findingId: string): Promise<AiFinding | null> {
  const { staff } = await requireRRASession("super_admin", "compliance_officer", "audit_officer", "audit_investigation_officer", "data_ai_analyst", "tax_compliance_officer");
  const canReadFormula = staff.clearanceRoles.some((role) => role !== "super_admin" && hasRRAPermission(role, "production.formula.read"));
  const parsedId = z.string().trim().min(1).max(128).safeParse(findingId);
  if (!parsedId.success) return null;
  const [row] = await db.select({
    id: aiFinding.id,
    findingType: aiFinding.findingType,
    severity: aiFinding.severity,
    reviewStatus: aiFinding.reviewStatus,
    businessId: aiFinding.businessId,
    businessName: user.businessName,
    name: user.name,
    tinNumber: user.tinNumber,
    productId: aiFinding.productId,
    observedValue: aiFinding.observedValue,
    expectedValue: aiFinding.expectedValue,
    difference: aiFinding.difference,
    explanation: aiFinding.explanation,
    evidenceRefs: aiFinding.evidenceRefs,
    transactionIds: aiFinding.transactionIds,
    resolutionNotes: aiFinding.resolutionNotes,
    createdAt: aiFinding.createdAt,
    updatedAt: aiFinding.updatedAt,
  }).from(aiFinding)
    .leftJoin(user, eq(aiFinding.businessId, user.id))
    .where(eq(aiFinding.id, parsedId.data))
    .limit(1);
  if (!row) return null;
  return {
    ...row,
    findingType: row.findingType as FindingType,
    severity: row.severity as FindingSeverity,
    reviewStatus: row.reviewStatus as FindingStatus,
    businessName: row.businessName ?? row.name ?? null,
    evidenceRefs: row.findingType === "production_discrepancy" && !canReadFormula ? null : row.evidenceRefs,
    resolutionNotes: row.findingType === "production_discrepancy" && !canReadFormula ? null : row.resolutionNotes,
    affectedTransactionIds: row.transactionIds,
    resolvedById: null,
    resolvedNote: row.findingType === "production_discrepancy" && !canReadFormula ? null : row.resolutionNotes,
  };
}

export async function updateFindingStatus(
  findingId: string,
  newStatus: FindingStatus,
  note?: string,
): Promise<{ success: boolean; error?: string }> {
  const { user: sessionUser, staff } = await requireRRASession("compliance_officer", "audit_officer", "audit_investigation_officer");
  const parsed = updateFindingSchema.safeParse({ findingId, newStatus, note });
  if (!parsed.success) return { success: false, error: "Invalid finding update." };

  try {
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ reviewStatus: aiFinding.reviewStatus, resolutionNotes: aiFinding.resolutionNotes, findingType: aiFinding.findingType })
        .from(aiFinding)
        .where(eq(aiFinding.id, parsed.data.findingId))
        .limit(1);
      if (!current) throw new Error("Finding not found.");
      if (current.findingType === "production_discrepancy"
        && !staff.clearanceRoles.some((role) => role !== "super_admin" && hasRRAPermission(role, "production.formula.read"))) {
        throw new Error("Production findings require the dedicated production history permission.");
      }

      const now = new Date();
      await tx
        .update(aiFinding)
        .set({
          reviewStatus: parsed.data.newStatus,
          assignedReviewerId: parsed.data.newStatus === "under_review" ? sessionUser.id : undefined,
          ...(parsed.data.note !== undefined ? { resolutionNotes: parsed.data.note } : {}),
          ...(parsed.data.newStatus === "resolved" || parsed.data.newStatus === "dismissed" ? { resolvedAt: now } : {}),
          ...(parsed.data.newStatus === "open" || parsed.data.newStatus === "under_review" ? { resolvedAt: null } : {}),
          updatedAt: now,
        })
        .where(eq(aiFinding.id, parsed.data.findingId));

      await tx.insert(auditLog).values({
        userId: sessionUser.id,
        action: "AI_FINDING_STATUS_UPDATED",
        targetType: "ai_finding",
        targetId: parsed.data.findingId,
        beforeState: current.findingType === "production_discrepancy"
          ? { reviewStatus: current.reviewStatus, hasReviewerNote: Boolean(current.resolutionNotes) }
          : { reviewStatus: current.reviewStatus, resolutionNotes: current.resolutionNotes },
        afterState: current.findingType === "production_discrepancy"
          ? {
            reviewStatus: parsed.data.newStatus,
            hasReviewerNote: Boolean(parsed.data.note ?? current.resolutionNotes),
            reviewerNoteLength: parsed.data.note?.length ?? current.resolutionNotes?.length ?? 0,
            reviewerNoteHash: parsed.data.note ? createHash("sha256").update(parsed.data.note).digest("hex") : null,
          }
          : { reviewStatus: parsed.data.newStatus, resolutionNotes: parsed.data.note ?? current.resolutionNotes },
      });
    });
    return { success: true };
  } catch (error) {
    console.error("AI finding update failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Could not update finding." };
  }
}

export async function runReconciliationScan(): Promise<{
  success: boolean;
  scanned: number;
  count: number;
  created: number;
  refreshed: number;
  error?: string;
}> {
  const { user: sessionUser } = await requireRRASession("stock_officer", "compliance_officer", "audit_officer");
  try {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
    const result = await reconcileAndCreateFindings(periodStart, periodEnd, sessionUser.id);
    return {
      success: true,
      scanned: result.scanned,
      count: result.scanned,
      created: result.findingsCreated,
      refreshed: result.findingsRefreshed,
    };
  } catch (error) {
    console.error("Inventory reconciliation scan failed", error);
    return {
      success: false,
      scanned: 0,
      count: 0,
      created: 0,
      refreshed: 0,
      error: "Reconciliation scan failed. Check the server logs for details.",
    };
  }
}

/** Run a bounded, read-only historical analysis and persist redacted review signals. */
export async function runProductionHistoryScan(): Promise<{ success: boolean; scanned: number; created: number; error?: string }> {
  const access = await requireRRAPermission("production.formula.read");
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 90 * 86_400_000);

  try {
    const candidates = await db.select({
      id: productionBatch.id,
      batchReference: productionBatch.batchReference,
      tin: user.tinNumber,
    }).from(productionBatch)
      .innerJoin(user, eq(productionBatch.manufacturerId, user.id))
      .where(and(
        isNotNull(productionBatch.recipeVersionId),
        gte(productionBatch.createdAt, periodStart),
        or(
          isNull(productionBatch.status),
          ne(productionBatch.status, "independently_supported"),
          ne(productionBatch.productionValidationStatus, "within_tolerance"),
        ),
      ))
      .orderBy(desc(productionBatch.createdAt))
      .limit(25);

    const findings: Array<{
      id: string;
      findingType: string;
      severity: string;
      businessId: string;
      productId: string;
      observedValue: null;
      expectedValue: null;
      difference: null;
      explanation: string;
      evidenceRefs: string;
      detectionMethod: string;
      reviewStatus: string;
      modelVersion: string;
    }> = [];

    for (const candidate of candidates) {
      if (!candidate.tin) continue;
      const analysis = await getProductionHistoryAnalysis({
        tin: candidate.tin,
        batchReference: candidate.batchReference,
        lookbackDays: 90,
      });
      if (!analysis.found) continue;
      const batch = analysis.batches[0];
      if (!batch || batch.signalCount === 0) continue;
      const metricCodes = [...new Set(batch.metrics.filter((metric) => metric.signal === "unusual")
        .map((metric) => metric.code.startsWith("material_usage:") ? "material_usage" : metric.code))];
      const stableId = createHash("sha256")
        .update(`${PRODUCTION_HISTORY_RULE_VERSION}:${batch.batchId}`)
        .digest("hex");
      findings.push({
        id: stableId,
        findingType: "production_discrepancy",
        severity: "warning",
        businessId: batch.manufacturerId,
        productId: batch.productId,
        observedValue: null,
        expectedValue: null,
        difference: null,
        explanation: "Historical production comparison generated a review signal for this batch. Compare its evidence with the exact recipe-version baseline using the authorized production history assistant. This signal is not proof of wrongdoing or an official determination.",
        evidenceRefs: JSON.stringify({
          schemaVersion: "production-history-evidence-v1",
          batchId: batch.batchId,
          batchReference: batch.batchReference,
          recipeVersionId: batch.recipeVersionId,
          baselineBatchReferences: [...new Set(batch.metrics.flatMap((metric) => metric.evidenceBatchReferences))],
          metricCodes,
          ruleVersion: PRODUCTION_HISTORY_RULE_VERSION,
          lookbackDays: 90,
        }),
        detectionMethod: "statistical",
        reviewStatus: "open",
        modelVersion: PRODUCTION_HISTORY_RULE_VERSION,
      });
    }

    const created = await db.transaction(async (tx) => {
      const inserted = findings.length
        ? await tx.insert(aiFinding).values(findings).onConflictDoNothing({ target: aiFinding.id }).returning({ id: aiFinding.id })
        : [];
      await tx.insert(aiAuditLog).values({
        requestedById: access.user.id,
        taskType: "anomaly_detection",
        referencedEntityIds: JSON.stringify({
          candidateCount: candidates.length,
          createdFindingIds: inserted.map((finding) => finding.id),
          periodStart,
          periodEnd,
        }),
        findingIds: JSON.stringify(inserted.map((finding) => finding.id)),
        modelProvider: "rules-engine",
        modelVersion: PRODUCTION_HISTORY_RULE_VERSION,
        reviewStatus: "pending",
      });
      await tx.insert(auditLog).values({
        userId: access.user.id,
        action: "PRODUCTION_HISTORY_SCAN_COMPLETED",
        targetType: "ai_finding_scan",
        metadata: JSON.stringify({
          candidateCount: candidates.length,
          createdFindingIds: inserted.map((finding) => finding.id),
          periodStart,
          periodEnd,
          ruleVersion: PRODUCTION_HISTORY_RULE_VERSION,
        }),
      });
      return inserted.length;
    });
    return { success: true, scanned: candidates.length, created };
  } catch (error) {
    console.error("Production history scan failed", {
      userId: access.user.id,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return { success: false, scanned: 0, created: 0, error: "Production history analysis could not be completed." };
  }
}
