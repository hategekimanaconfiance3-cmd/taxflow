"use server";

import { requireRRASession } from "@/lib/auth-guard";
import { computeAllRiskScores } from "@/lib/ai/risk-scoring";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FindingSeverity = "info" | "low" | "medium" | "high" | "critical";
export type FindingStatus   = "open" | "under_review" | "resolved" | "dismissed";
export type FindingType =
    | "stock_discrepancy"
    | "underreporting"
    | "price_anomaly"
    | "tax_gap"
    | "duplicate_transaction"
    | "supply_chain_gap"
    | "data_quality"
    | "risk_score";

export interface AiFinding {
    id: string;
    findingType: FindingType;
    severity: FindingSeverity;
    reviewStatus: FindingStatus;
    businessId: string | null;
    businessName: string | null;
    tinNumber: string | null;
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

// ---------------------------------------------------------------------------
// Empty defaults (used as fallback if table doesn't exist)
// ---------------------------------------------------------------------------

const EMPTY_STATS: FindingStats = {
    total: 0,
    open: 0,
    critical: 0,
    underReview: 0,
    highRiskBusinesses: 0,
    dataQualityIssues: 0,
    lastScanAt: null,
};

// ---------------------------------------------------------------------------
// getFindingStats — returns aggregate stats.
// Returns zeros gracefully if the aiFinding table doesn't exist yet.
// ---------------------------------------------------------------------------

export async function getFindingStats(): Promise<FindingStats> {
    await requireRRASession();
    try {
        // Lazy imports guard against missing table at module-parse time
        const { default: db } = await import("@/db/drizzle");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const schema: Record<string, any> = await import("@/db/schema");

        if (!schema.aiFinding) return EMPTY_STATS;

        const { sql } = await import("drizzle-orm");
        const tbl = schema.aiFinding;

        const [row] = await db
            .select({
                total:       sql<number>`COUNT(*)::int`,
                open:        sql<number>`COUNT(*) FILTER (WHERE ${tbl.reviewStatus} = 'open')::int`,
                critical:    sql<number>`COUNT(*) FILTER (WHERE ${tbl.severity} = 'critical')::int`,
                underReview: sql<number>`COUNT(*) FILTER (WHERE ${tbl.reviewStatus} = 'under_review')::int`,
                highRisk:    sql<number>`COUNT(*) FILTER (WHERE ${tbl.severity} IN ('high','critical'))::int`,
                dataQuality: sql<number>`COUNT(*) FILTER (WHERE ${tbl.findingType} = 'data_quality')::int`,
            })
            .from(tbl);

        const [last] = await db
            .select({ createdAt: tbl.createdAt })
            .from(tbl)
            .orderBy(sql`${tbl.createdAt} DESC`)
            .limit(1);

        return {
            total:               row?.total ?? 0,
            open:                row?.open ?? 0,
            critical:            row?.critical ?? 0,
            underReview:         row?.underReview ?? 0,
            highRiskBusinesses:  row?.highRisk ?? 0,
            dataQualityIssues:   row?.dataQuality ?? 0,
            lastScanAt:          last?.createdAt ?? null,
        };
    } catch {
        return EMPTY_STATS;
    }
}

// ---------------------------------------------------------------------------
// getFindings — paginated list with filters.
// ---------------------------------------------------------------------------

export async function getFindings(filters: FindingFilters = {}): Promise<AiFinding[]> {
    await requireRRASession();
    try {
        const { default: db } = await import("@/db/drizzle");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const schema: Record<string, any> = await import("@/db/schema");

        if (!schema.aiFinding) return [];

        const { desc, and, sql } = await import("drizzle-orm");
        const tbl = schema.aiFinding;

        // Build where conditions via raw SQL fragments to stay type-safe
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const conditions: any[] = [];
        if (filters.findingType) conditions.push(sql`${tbl.findingType} = ${filters.findingType}`);
        if (filters.severity)    conditions.push(sql`${tbl.severity} = ${filters.severity}`);
        if (filters.reviewStatus) conditions.push(sql`${tbl.reviewStatus} = ${filters.reviewStatus}`);
        if (filters.businessId)  conditions.push(sql`${tbl.businessId} = ${filters.businessId}`);
        if (filters.dateFrom)    conditions.push(sql`${tbl.createdAt} >= ${filters.dateFrom}`);
        if (filters.dateTo)      conditions.push(sql`${tbl.createdAt} <= ${filters.dateTo}`);

        const rows = await db
            .select()
            .from(tbl)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(tbl.createdAt))
            .limit(filters.limit ?? 20)
            .offset(filters.offset ?? 0);

        return rows as AiFinding[];
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// updateFindingStatus
// ---------------------------------------------------------------------------

export async function updateFindingStatus(
    findingId: string,
    newStatus: FindingStatus,
    note?: string,
): Promise<{ success: boolean; error?: string }> {
    const { user: sessionUser } = await requireRRASession("compliance_officer", "audit_officer");
    try {
        const { default: db } = await import("@/db/drizzle");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const schema: Record<string, any> = await import("@/db/schema");
        if (!schema.aiFinding) return { success: false, error: "aiFinding table not available yet" };
        const { eq } = await import("drizzle-orm");
        const tbl = schema.aiFinding;

        await db
            .update(tbl)
            .set({
                reviewStatus: newStatus,
                ...(note ? { resolvedNote: note } : {}),
                ...(["resolved", "dismissed"].includes(newStatus) ? { resolvedById: sessionUser.id } : {}),
                updatedAt: new Date(),
            })
            .where(eq(tbl.id, findingId));

        return { success: true };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

// ---------------------------------------------------------------------------
// runReconciliationScan — runs risk-scoring for all traders
// ---------------------------------------------------------------------------

export async function runReconciliationScan(): Promise<{ success: boolean; count: number; error?: string }> {
    await requireRRASession("compliance_officer", "audit_officer");
    try {
        const scores = await computeAllRiskScores();
        return { success: true, count: scores.length };
    } catch (err) {
        return { success: false, count: 0, error: String(err) };
    }
}
