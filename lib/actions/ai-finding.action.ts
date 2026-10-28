"use server";

import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import db from "@/db/drizzle";
import { aiAuditLog, aiFinding, auditLog, user } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";
import { reconcileAndCreateFindings } from "@/lib/ai/reconciliation";

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
  await requireRRASession("super_admin", "compliance_officer", "audit_officer", "audit_investigation_officer", "data_ai_analyst");
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
    affectedTransactionIds: row.transactionIds,
    resolvedById: null,
    resolvedNote: row.resolutionNotes,
  }));
}

export async function updateFindingStatus(
  findingId: string,
  newStatus: FindingStatus,
  note?: string,
): Promise<{ success: boolean; error?: string }> {
  const { user: sessionUser } = await requireRRASession("compliance_officer", "audit_officer");
  const parsed = updateFindingSchema.safeParse({ findingId, newStatus, note });
  if (!parsed.success) return { success: false, error: "Invalid finding update." };

  try {
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ reviewStatus: aiFinding.reviewStatus, resolutionNotes: aiFinding.resolutionNotes })
        .from(aiFinding)
        .where(eq(aiFinding.id, parsed.data.findingId))
        .limit(1);
      if (!current) throw new Error("Finding not found.");

      const now = new Date();
      await tx
        .update(aiFinding)
        .set({
          reviewStatus: parsed.data.newStatus,
          ...(parsed.data.note !== undefined ? { resolutionNotes: parsed.data.note } : {}),
          ...(parsed.data.newStatus === "resolved" || parsed.data.newStatus === "dismissed" ? { resolvedAt: now } : {}),
          updatedAt: now,
        })
        .where(eq(aiFinding.id, parsed.data.findingId));

      await tx.insert(auditLog).values({
        userId: sessionUser.id,
        action: "AI_FINDING_STATUS_UPDATED",
        targetType: "ai_finding",
        targetId: parsed.data.findingId,
        beforeState: { reviewStatus: current.reviewStatus, resolutionNotes: current.resolutionNotes },
        afterState: { reviewStatus: parsed.data.newStatus, resolutionNotes: parsed.data.note ?? current.resolutionNotes },
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
