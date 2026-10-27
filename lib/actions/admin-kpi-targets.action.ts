"use server";

import { sql, eq, and, gte, lt, inArray } from "drizzle-orm";
import db from "@/db/drizzle";
import { user, vatRecord, taxPayment, transaction, dispute, systemConfig, auditLog } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KPIMetric = {
    key: string;
    label: string;
    currentValue: number;
    targetValue: number | null;
    unit: string;             // "RWF", "%", "count"
    progressPct: number;      // 0–100, null target = 0
    status: "on_track" | "at_risk" | "behind" | "no_target";
};

export type KPIProgressReport = {
    metrics: KPIMetric[];
    computedAt: Date;
    period: "monthly" | "quarterly" | "annual";
    periodLabel: string;
};

// ---------------------------------------------------------------------------
// KPI key prefix in systemConfig
// ---------------------------------------------------------------------------

const KPI_PREFIX = "kpi_target_";
const KPI_KEYS = ["revenue_collected", "compliance_rate", "registered_traders", "dispute_resolution", "monthly_volume"] as const;
export type KPIPeriod = "monthly" | "quarterly" | "annual";

function getKpiRange(period: KPIPeriod, now: Date) {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    if (period === "monthly") {
        const from = new Date(Date.UTC(year, month, 1));
        return { from, to: new Date(Date.UTC(year, month + 1, 1)), label: from.toLocaleDateString("en-RW", { month: "long", year: "numeric", timeZone: "UTC" }), token: `${year}_${String(month + 1).padStart(2, "0")}` };
    }
    if (period === "quarterly") {
        const quarter = Math.floor(month / 3);
        const from = new Date(Date.UTC(year, quarter * 3, 1));
        return { from, to: new Date(Date.UTC(year, quarter * 3 + 3, 1)), label: `Q${quarter + 1} ${year}`, token: `${year}_q${quarter + 1}` };
    }
    return { from: new Date(Date.UTC(year, 0, 1)), to: new Date(Date.UTC(year + 1, 0, 1)), label: String(year), token: String(year) };
}

// ---------------------------------------------------------------------------
// Set a KPI target (super_admin only)
// ---------------------------------------------------------------------------

const setTargetSchema = z.object({
    key: z.enum(KPI_KEYS),
    targetValue: z.number().finite().positive().max(1_000_000_000_000),
    period: z.enum(["monthly", "quarterly", "annual"]),
}).strict();

export async function setKPITarget(input: unknown): Promise<{ success: true }> {
    const session = await requireRRASession("super_admin");
    const parsed = setTargetSchema.safeParse(input);
    if (!parsed.success) throw new Error("Enter a valid KPI target and period.");
    const { key, targetValue, period } = parsed.data;
    if ((key === "compliance_rate" || key === "dispute_resolution") && targetValue > 100) throw new Error("Percentage targets must be between 0 and 100.");
    const range = getKpiRange(period, new Date());
    const configKey = `${KPI_PREFIX}${period}_${range.token}_${key}`;

    await db.transaction(async (tx) => {
        const [existing] = await tx.select().from(systemConfig).where(eq(systemConfig.key, configKey)).for("update").limit(1);
        const oldValue = existing?.value ?? (period === "monthly" ? (await tx.select({ value: systemConfig.value }).from(systemConfig).where(eq(systemConfig.key, `${KPI_PREFIX}${key}`)).limit(1))[0]?.value : undefined) ?? null;
        await tx.insert(systemConfig).values({ key: configKey, value: String(targetValue), updatedBy: session.user.id })
            .onConflictDoUpdate({ target: systemConfig.key, set: { value: String(targetValue), updatedBy: session.user.id, updatedAt: new Date() } });
        await logAudit({
            userId: session.user.id, action: "KPI_TARGET_SET", targetType: "system_config", targetId: configKey,
            beforeState: { targetValue: oldValue, period }, afterState: { targetValue, period },
            metadata: { key, period, periodLabel: range.label },
        }, async (entry) => { await tx.insert(auditLog).values(entry); });
    });

    return { success: true };
}

// ---------------------------------------------------------------------------
// Get all KPI targets from systemConfig
// ---------------------------------------------------------------------------

async function getTargets(period: KPIPeriod, range: ReturnType<typeof getKpiRange>): Promise<Map<string, number>> {
    const keys = KPI_KEYS.map((key) => `${KPI_PREFIX}${period}_${range.token}_${key}`);
    if (period === "monthly") keys.push(...KPI_KEYS.map((key) => `${KPI_PREFIX}${key}`));
    const rows = await db.select().from(systemConfig).where(inArray(systemConfig.key, keys));

    const map = new Map<string, number>();
    for (const row of rows) {
        const legacyKey = row.key.replace(KPI_PREFIX, "");
        const currentPrefix = `${period}_${range.token}_`;
        const key = legacyKey.startsWith(currentPrefix) ? legacyKey.slice(currentPrefix.length) : legacyKey;
        if (Number.isFinite(Number(row.value)) && (period !== "monthly" || !map.has(key) || legacyKey.startsWith(currentPrefix))) map.set(key, Number(row.value));
    }
    return map;
}

// ---------------------------------------------------------------------------
// Compute current KPI values and compare against targets
// ---------------------------------------------------------------------------

export async function getKPIProgress(period: KPIPeriod = "monthly"): Promise<KPIProgressReport> {
    await requireRRASession("super_admin", "compliance_officer", "reporting_officer");
    const range = getKpiRange(period, new Date());
    const targets = await getTargets(period, range);

    // ── Metric 1: Total Revenue Collected ──────────────────────────────
    const [revResult] = await db
        .select({
            total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as("total"),
        })
        .from(taxPayment)
        .where(and(eq(taxPayment.status, "confirmed"), gte(taxPayment.createdAt, range.from), lt(taxPayment.createdAt, range.to)));

    const revenueCollected = revResult?.total || 0;

    // ── Metric 2: Compliance Rate (% of traders above 95%) ────────────
    const traders = await db
        .select({ id: user.id })
        .from(user)
        .where(and(sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`, gte(user.createdAt, range.from), lt(user.createdAt, range.to)));

    const allTraders = await db
        .select({ id: user.id })
        .from(user)
        .where(sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`);

    let compliantCount = 0;
    for (const trader of allTraders) {
        const vatResult = await db
            .select({
                vatType: vatRecord.vatType,
                total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as("total"),
            })
            .from(vatRecord)
            .where(and(eq(vatRecord.businessId, trader.id), eq(vatRecord.isFrozen, false)))
            .groupBy(vatRecord.vatType);

        const output = Number(vatResult.find((r) => r.vatType === "output")?.total) || 0;
        const input = Number(vatResult.find((r) => r.vatType === "input")?.total) || 0;
        const owed = Math.max(0, output - input);

        if (owed === 0) {
            compliantCount++;
            continue;
        }

        const [payResult] = await db
            .select({
                paid: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as("paid"),
            })
            .from(taxPayment)
            .where(sql`${taxPayment.businessId} = ${trader.id} AND ${taxPayment.status} = 'confirmed'`);

        const paid = Number(payResult?.paid) || 0;
        if ((paid / owed) * 100 >= 95) compliantCount++;
    }

    const complianceRate = allTraders.length > 0
        ? Math.round((compliantCount / allTraders.length) * 100)
        : 100;

    // ── Metric 3: Registered Traders ──────────────────────────────────
    const registeredTraders = traders.length;

    // ── Metric 4: Dispute Resolution Rate (% resolved) ────────────────
    const [disputeStats] = await db
        .select({
            total: sql<number>`COUNT(*)::int`.as("total"),
            resolved: sql<number>`COUNT(*) FILTER (WHERE ${dispute.status} IN ('resolved', 'dismissed'))::int`.as("resolved"),
        })
        .from(dispute);

    const disputeTotal = disputeStats?.total || 0;
    const disputeResolved = disputeStats?.resolved || 0;
    const resolutionRate = disputeTotal > 0
        ? Math.round((disputeResolved / disputeTotal) * 100)
        : 100;

    // ── Metric 5: Transaction Volume (total value this month) ─────────
    const [txnVolume] = await db
        .select({
            total: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`.as("total"),
        })
        .from(transaction)
        .where(
            and(inArray(transaction.status, ["confirmed", "completed"]), gte(transaction.createdAt, range.from), lt(transaction.createdAt, range.to)),
        );

    const monthlyVolume = txnVolume?.total || 0;

    // ── Build metrics array ────────────────────────────────────────────
    const rawMetrics = [
        { key: "revenue_collected", label: "Confirmed Tax Payments", value: revenueCollected, unit: "RWF" },
        { key: "compliance_rate", label: "Compliance Rate", value: complianceRate, unit: "%" },
        { key: "registered_traders", label: "New Trader Registrations", value: registeredTraders, unit: "count" },
        { key: "dispute_resolution", label: "Dispute Resolution Rate", value: resolutionRate, unit: "%" },
        { key: "monthly_volume", label: "Confirmed Transaction Value", value: monthlyVolume, unit: "RWF" },
    ];

    const metrics: KPIMetric[] = rawMetrics.map((m) => {
        const target = targets.get(m.key) ?? null;
        const progressPct = target && target > 0
            ? Math.min(100, Math.round((m.value / target) * 100))
            : 0;

        let status: KPIMetric["status"];
        if (target === null) {
            status = "no_target";
        } else if (progressPct >= 90) {
            status = "on_track";
        } else if (progressPct >= 60) {
            status = "at_risk";
        } else {
            status = "behind";
        }

        return {
            key: m.key,
            label: m.label,
            currentValue: m.value,
            targetValue: target,
            unit: m.unit,
            progressPct,
            status,
        };
    });

    return {
        metrics,
        computedAt: new Date(),
        period,
        periodLabel: range.label,
    };
}
