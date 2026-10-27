"use server";

import { eq, sql, and } from "drizzle-orm";
import db from "@/db/drizzle";
import { systemConfig, auditLog, taxPayment, vatRecord, user } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

// ---------------------------------------------------------------------------
// KPI config keys
// ---------------------------------------------------------------------------

const KPI_KEYS = {
    vatTarget: "kpi_vat_target_monthly",
    traderTarget: "kpi_trader_registration_target",
    complianceTarget: "kpi_compliance_rate_target",
    targetMonth: "kpi_target_month",
} as const;

// ---------------------------------------------------------------------------
// Helper: current YYYY-MM string
// ---------------------------------------------------------------------------

function currentYearMonth(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
}

// ---------------------------------------------------------------------------
// Read KPI targets (no auth guard — server component guards the page)
// ---------------------------------------------------------------------------

export interface KpiTargets {
    vatTarget: number;
    traderTarget: number;
    complianceTarget: number;
    targetMonth: string;
}

export async function getKpiTargets(): Promise<KpiTargets> {
    const rows = await db.select().from(systemConfig).where(
        sql`${systemConfig.key} IN (${KPI_KEYS.vatTarget}, ${KPI_KEYS.traderTarget}, ${KPI_KEYS.complianceTarget}, ${KPI_KEYS.targetMonth})`
    );

    const map = new Map(rows.map((r) => [r.key, r.value]));

    return {
        vatTarget: parseInt(map.get(KPI_KEYS.vatTarget) ?? "0", 10) || 0,
        traderTarget: parseInt(map.get(KPI_KEYS.traderTarget) ?? "0", 10) || 0,
        complianceTarget: parseFloat(map.get(KPI_KEYS.complianceTarget) ?? "0.90"),
        targetMonth: map.get(KPI_KEYS.targetMonth) ?? currentYearMonth(),
    };
}

// ---------------------------------------------------------------------------
// Read KPI progress for a given month (no auth guard)
// ---------------------------------------------------------------------------

export interface KpiProgress {
    vatCollected: number;
    vatGenerated: number;
    newTraders: number;
    complianceRate: number;
}

export async function getKpiProgress(targetMonth: string): Promise<KpiProgress> {
    // Parse targetMonth "YYYY-MM" into start/end Date boundaries
    const [yearStr, monthStr] = targetMonth.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10); // 1-based

    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 1); // exclusive upper bound

    const [vatCollectedResult, vatGeneratedResult, newTradersResult, complianceResult] =
        await Promise.all([
            // 1. VAT collected: SUM taxPayment.amount WHERE status='confirmed' AND createdAt in targetMonth
            db
                .select({
                    total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as("total"),
                })
                .from(taxPayment)
                .where(
                    and(
                        eq(taxPayment.status, "confirmed"),
                        sql`${taxPayment.createdAt} >= ${monthStart.toISOString()}`,
                        sql`${taxPayment.createdAt} < ${monthEnd.toISOString()}`
                    )
                ),

            // 2. VAT generated: SUM vatRecord.amount WHERE vatType='output' AND createdAt in targetMonth
            db
                .select({
                    total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as("total"),
                })
                .from(vatRecord)
                .where(
                    and(
                        eq(vatRecord.vatType, "output"),
                        sql`${vatRecord.createdAt} >= ${monthStart.toISOString()}`,
                        sql`${vatRecord.createdAt} < ${monthEnd.toISOString()}`
                    )
                ),

            // 3. New traders registered in targetMonth
            db
                .select({
                    count: sql<number>`COUNT(*)::int`.as("count"),
                })
                .from(user)
                .where(
                    and(
                        sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
                        sql`${user.createdAt} >= ${monthStart.toISOString()}`,
                        sql`${user.createdAt} < ${monthEnd.toISOString()}`
                    )
                ),

            // 4. Compliance rate: total confirmed payments / total output VAT (all time)
            db
                .select({
                    confirmedPayments: sql<number>`COALESCE(SUM(CASE WHEN ${taxPayment.status} = 'confirmed' THEN ${taxPayment.amount} ELSE 0 END), 0)::float8`.as("confirmed_payments"),
                })
                .from(taxPayment),
        ]);

    const vatCollected = Number(vatCollectedResult[0]?.total ?? 0) || 0;
    const vatGenerated = Number(vatGeneratedResult[0]?.total ?? 0) || 0;
    const newTraders = Number(newTradersResult[0]?.count ?? 0) || 0;
    const confirmedPayments = Number(complianceResult[0]?.confirmedPayments ?? 0) || 0;

    // Compliance rate: confirmed payments as fraction of all output VAT generated (all time)
    const [allTimeOutputResult] = await db
        .select({
            total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as("total"),
        })
        .from(vatRecord)
        .where(eq(vatRecord.vatType, "output"));

    const allTimeOutput = Number(allTimeOutputResult?.total ?? 0) || 0;
    const complianceRate = allTimeOutput > 0 ? Math.min(confirmedPayments / allTimeOutput, 1) : 0;

    return {
        vatCollected,
        vatGenerated,
        newTraders,
        complianceRate,
    };
}

// ---------------------------------------------------------------------------
// Update KPI targets (super_admin only)
// ---------------------------------------------------------------------------

const updateKpiSchema = z.object({
    vatTarget: z.number().int().min(0),
    traderTarget: z.number().int().min(0),
    complianceTarget: z.number().min(0.01).max(1),
    targetMonth: z.string().regex(/^\d{4}-\d{2}$/),
});

export async function updateKpiTargets(data: unknown): Promise<{ success: true }> {
    const session = await requireRRASession("super_admin");

    const parsed = updateKpiSchema.safeParse(data);
    if (!parsed.success) {
        throw new Error(`Invalid KPI target data: ${parsed.error.issues.map((i) => i.message).join(", ")}`);
    }

    const { vatTarget, traderTarget, complianceTarget, targetMonth } = parsed.data;

    const upserts: { key: string; value: string }[] = [
        { key: KPI_KEYS.vatTarget, value: String(vatTarget) },
        { key: KPI_KEYS.traderTarget, value: String(traderTarget) },
        { key: KPI_KEYS.complianceTarget, value: String(complianceTarget) },
        { key: KPI_KEYS.targetMonth, value: targetMonth },
    ];

    await db.transaction(async (tx) => {
        for (const { key, value } of upserts) {
            await tx
                .insert(systemConfig)
                .values({ key, value, updatedBy: session.user.id })
                .onConflictDoUpdate({
                    target: systemConfig.key,
                    set: { value, updatedBy: session.user.id, updatedAt: new Date() },
                });
        }

        await logAudit(
            {
                userId: session.user.id,
                action: "KPI_TARGETS_UPDATED",
                targetType: "system_config",
                targetId: "kpi_targets",
                metadata: {
                    vatTarget,
                    traderTarget,
                    complianceTarget,
                    targetMonth,
                },
            },
            async (entry) => {
                await tx.insert(auditLog).values(entry);
            }
        );
    });

    return { success: true };
}
