"use server";

import { sql, eq } from "drizzle-orm";
import db from "@/db/drizzle";
import { user, vatRecord, taxPayment, transaction, dispute, auditLog } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComplianceSummaryReport = {
    generatedAt: Date;
    period: string;
    traders: {
        total: number;
        compliant: number;
        nonCompliant: number;
        suspended: number;
        complianceRate: number;
    };
    revenue: {
        totalOwed: number;
        totalCollected: number;
        outstanding: number;
        collectionRate: number;
    };
    transactions: {
        totalCount: number;
        totalValue: number;
        confirmedCount: number;
        rejectedCount: number;
        expiredCount: number;
    };
    disputes: {
        total: number;
        resolved: number;
        pending: number;
        resolutionRate: number;
    };
    topArrears: Array<{
        traderName: string;
        outstanding: number;
    }>;
    anomalyCount: number;
};

// ---------------------------------------------------------------------------
// Generate comprehensive compliance summary report
// ---------------------------------------------------------------------------

export async function generateComplianceSummary(): Promise<ComplianceSummaryReport> {
    const { staff, ...session } = await requireRRASession("super_admin", "compliance_officer", "reporting_officer");

    // ── Trader Stats ───────────────────────────────────────────────────
    const traders = await db
        .select({
            id: user.id,
            businessName: user.businessName,
            name: user.name,
            clearanceStatus: user.clearanceStatus,
        })
        .from(user)
        .where(sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`);

    const suspended = traders.filter((t) => t.clearanceStatus === "suspended").length;

    // Calculate per-trader compliance
    let compliantCount = 0;
    const traderArrears: Array<{ traderName: string; outstanding: number }> = [];

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
        const outstanding = Math.max(0, owed - paid);

        if ((paid / owed) * 100 >= 95) {
            compliantCount++;
        }

        if (outstanding > 0) {
            traderArrears.push({
                traderName: trader.businessName ?? trader.name,
                outstanding,
            });
        }
    }

    // Sort arrears by highest outstanding
    traderArrears.sort((a, b) => b.outstanding - a.outstanding);

    // ── Revenue Stats ──────────────────────────────────────────────────
    const [revenueOwed] = await db
        .select({
            output: sql<number>`COALESCE(SUM(CASE WHEN ${vatRecord.vatType} = 'output' THEN ${vatRecord.amount} ELSE 0 END), 0)::float8`.as("output"),
            input: sql<number>`COALESCE(SUM(CASE WHEN ${vatRecord.vatType} = 'input' THEN ${vatRecord.amount} ELSE 0 END), 0)::float8`.as("input"),
        })
        .from(vatRecord);

    const totalOwed = Math.max(0, (revenueOwed?.output || 0) - (revenueOwed?.input || 0));

    const [revenueCollected] = await db
        .select({
            total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as("total"),
        })
        .from(taxPayment)
        .where(eq(taxPayment.status, "confirmed"));

    const totalCollected = revenueCollected?.total || 0;

    // ── Transaction Stats ──────────────────────────────────────────────
    const [txnStats] = await db
        .select({
            total: sql<number>`COUNT(*)::int`.as("total"),
            totalValue: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`.as("total_value"),
            confirmed: sql<number>`COUNT(*) FILTER (WHERE ${transaction.status} IN ('confirmed', 'completed'))::int`.as("confirmed"),
            rejected: sql<number>`COUNT(*) FILTER (WHERE ${transaction.status} = 'rejected')::int`.as("rejected"),
            expired: sql<number>`COUNT(*) FILTER (WHERE ${transaction.status} = 'expired')::int`.as("expired"),
        })
        .from(transaction);

    // ── Dispute Stats ──────────────────────────────────────────────────
    const [disputeStats] = await db
        .select({
            total: sql<number>`COUNT(*)::int`.as("total"),
            resolved: sql<number>`COUNT(*) FILTER (WHERE ${dispute.status} IN ('resolved', 'dismissed'))::int`.as("resolved"),
            pending: sql<number>`COUNT(*) FILTER (WHERE ${dispute.status} IN ('filed', 'acknowledged', 'under_review'))::int`.as("pending"),
        })
        .from(dispute);

    // ── Anomaly Count (suspicious flags in last 30 days) ───────────────
    const [anomalyResult] = await db
        .select({
            count: sql<number>`COUNT(*)::int`.as("count"),
        })
        .from(auditLog)
        .where(
            sql`${auditLog.action} = 'SUSPICIOUS_FLAGGED' AND ${auditLog.createdAt} >= NOW() - INTERVAL '30 days'`,
        );

    // ── Log the report generation ──────────────────────────────────────
    await logAudit({
        userId: session.user.id,
        action: "SUMMARY_REPORT_GENERATED",
        targetType: "system",
        targetId: "compliance_summary",
        metadata: {
            generatedBy: staff.staffId,
        },
    });

    const disputeTotal = disputeStats?.total || 0;
    const disputeResolved = disputeStats?.resolved || 0;

    return {
        generatedAt: new Date(),
        period: `As of ${new Date().toLocaleDateString("en-RW")}`,
        traders: {
            total: traders.length,
            compliant: compliantCount,
            nonCompliant: traders.length - compliantCount,
            suspended,
            complianceRate: traders.length > 0
                ? Math.round((compliantCount / traders.length) * 100)
                : 100,
        },
        revenue: {
            totalOwed,
            totalCollected,
            outstanding: Math.max(0, totalOwed - totalCollected),
            collectionRate: totalOwed > 0
                ? Math.round((totalCollected / totalOwed) * 100)
                : 100,
        },
        transactions: {
            totalCount: txnStats?.total || 0,
            totalValue: txnStats?.totalValue || 0,
            confirmedCount: txnStats?.confirmed || 0,
            rejectedCount: txnStats?.rejected || 0,
            expiredCount: txnStats?.expired || 0,
        },
        disputes: {
            total: disputeTotal,
            resolved: disputeResolved,
            pending: disputeStats?.pending || 0,
            resolutionRate: disputeTotal > 0
                ? Math.round((disputeResolved / disputeTotal) * 100)
                : 100,
        },
        topArrears: traderArrears.slice(0, 10),
        anomalyCount: anomalyResult?.count || 0,
    };
}
