"use server";

import { sql, eq } from "drizzle-orm";
import db from "@/db/drizzle";
import { user, vatRecord, taxPayment, transaction, dispute, systemConfig } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";

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
};

// ---------------------------------------------------------------------------
// KPI key prefix in systemConfig
// ---------------------------------------------------------------------------

const KPI_PREFIX = "kpi_target_";

// ---------------------------------------------------------------------------
// Set a KPI target (super_admin only)
// ---------------------------------------------------------------------------

export async function setKPITarget(
    key: string,
    targetValue: number,
): Promise<{ success: true }> {
    const session = await requireRRASession("super_admin");

    const configKey = `${KPI_PREFIX}${key}`;

    // Get old value for audit log
    const [existing] = await db
        .select()
        .from(systemConfig)
        .where(eq(systemConfig.key, configKey))
        .limit(1);

    const oldValue = existing?.value ?? "none";

    await db
        .insert(systemConfig)
        .values({
            key: configKey,
            value: String(targetValue),
            updatedBy: session.user.id,
        })
        .onConflictDoUpdate({
            target: systemConfig.key,
            set: {
                value: String(targetValue),
                updatedBy: session.user.id,
                updatedAt: new Date(),
            },
        });

    await logAudit({
        userId: session.user.id,
        action: "KPI_TARGET_SET",
        targetType: "system_config",
        targetId: configKey,
        metadata: {
            key,
            oldValue,
            newValue: String(targetValue),
        },
    });

    return { success: true };
}

// ---------------------------------------------------------------------------
// Get all KPI targets from systemConfig
// ---------------------------------------------------------------------------

async function getTargets(): Promise<Map<string, number>> {
    const rows = await db
        .select()
        .from(systemConfig)
        .where(sql`${systemConfig.key} LIKE ${KPI_PREFIX + "%"}`);

    const map = new Map<string, number>();
    for (const row of rows) {
        const key = row.key.replace(KPI_PREFIX, "");
        map.set(key, parseFloat(row.value));
    }
    return map;
}

// ---------------------------------------------------------------------------
// Compute current KPI values and compare against targets
// ---------------------------------------------------------------------------

export async function getKPIProgress(): Promise<KPIProgressReport> {
    await requireRRASession("super_admin", "compliance_officer", "reporting_officer");

    const targets = await getTargets();

    // ── Metric 1: Total Revenue Collected ──────────────────────────────
    const [revResult] = await db
        .select({
            total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as("total"),
        })
        .from(taxPayment)
        .where(eq(taxPayment.status, "confirmed"));

    const revenueCollected = revResult?.total || 0;

    // ── Metric 2: Compliance Rate (% of traders above 95%) ────────────
    const traders = await db
        .select({ id: user.id })
        .from(user)
        .where(sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`);

    let compliantCount = 0;
    for (const trader of traders) {
        const vatResult = await db
            .select({
                vatType: vatRecord.vatType,
                total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as("total"),
            })
            .from(vatRecord)
            .where(eq(vatRecord.businessId, trader.id))
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

    const complianceRate = traders.length > 0
        ? Math.round((compliantCount / traders.length) * 100)
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
            sql`${transaction.status} IN ('confirmed', 'completed') AND ${transaction.createdAt} >= DATE_TRUNC('month', CURRENT_DATE)`,
        );

    const monthlyVolume = txnVolume?.total || 0;

    // ── Build metrics array ────────────────────────────────────────────
    const rawMetrics = [
        { key: "revenue_collected", label: "Revenue Collected", value: revenueCollected, unit: "RWF" },
        { key: "compliance_rate", label: "Compliance Rate", value: complianceRate, unit: "%" },
        { key: "registered_traders", label: "Registered Traders", value: registeredTraders, unit: "count" },
        { key: "dispute_resolution", label: "Dispute Resolution Rate", value: resolutionRate, unit: "%" },
        { key: "monthly_volume", label: "Monthly Transaction Volume", value: monthlyVolume, unit: "RWF" },
    ];

    const metrics: KPIMetric[] = rawMetrics.map((m) => {
        const target = targets.get(m.key) ?? null;
        const progressPct = target && target > 0
            ? Math.min(100, Math.round((m.value / target) * 100))
            : 0;

        let status: KPIMetric["status"];
        if (target === null) {
            status = "no_target";
        } else if (progressPct >= 80) {
            status = "on_track";
        } else if (progressPct >= 50) {
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
    };
}
