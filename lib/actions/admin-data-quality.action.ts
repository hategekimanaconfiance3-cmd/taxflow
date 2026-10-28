"use server";

import { sql, eq } from "drizzle-orm";
import db from "@/db/drizzle";
import { user, transaction, stock, auditLog } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DataQualityMetrics = {
    traderCompleteness: {
        total: number;
        missingPhone: number;
        missingTin: number;
        missingBusinessName: number;
        completenessRate: number; // 0–100%
    };
    transactionHealth: {
        total: number;
        rejected: number;
        expired: number;
        rejectionRate: number; // 0–100%
        expirationRate: number; // 0–100%
    };
    stockIntegrity: {
        totalRecords: number;
        negativeStock: number;
        zeroStock: number;
        corrections: number;       // count of STOCK_CORRECTED audit entries
        negativeStockRate: number;  // 0–100%
    };
    auditActivity: {
        totalEntries: number;
        last7Days: number;
        last30Days: number;
    };
    overallScore: number; // 0–100 composite data quality score
};

// ---------------------------------------------------------------------------
// Get comprehensive data quality metrics
// ---------------------------------------------------------------------------

export async function getDataQualityMetrics(): Promise<DataQualityMetrics> {
    await requireRRASession("super_admin", "compliance_officer", "audit_officer", "data_ai_analyst");

    // ── Trader Completeness ────────────────────────────────────────────
    const traders = await db
        .select({
            id: user.id,
            phoneNumber: user.phoneNumber,
            tinNumber: user.tinNumber,
            businessName: user.businessName,
        })
        .from(user)
        .where(
            sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
        );

    const totalTraders = traders.length;
    const missingPhone = traders.filter((t) => !t.phoneNumber).length;
    const missingTin = traders.filter((t) => !t.tinNumber).length;
    const missingBusinessName = traders.filter((t) => !t.businessName).length;
    const totalFields = totalTraders * 3; // 3 key fields
    const missingFields = missingPhone + missingTin + missingBusinessName;
    const completenessRate = totalFields > 0
        ? Math.round(((totalFields - missingFields) / totalFields) * 100)
        : 100;

    // ── Transaction Health ─────────────────────────────────────────────
    const [txnStats] = await db
        .select({
            total: sql<number>`COUNT(*)::int`.as("total"),
            rejected: sql<number>`COUNT(*) FILTER (WHERE ${transaction.status} = 'rejected')::int`.as("rejected"),
            expired: sql<number>`COUNT(*) FILTER (WHERE ${transaction.status} = 'expired')::int`.as("expired"),
        })
        .from(transaction);

    const totalTxns = txnStats?.total || 0;
    const rejectionRate = totalTxns > 0 ? Math.round((txnStats.rejected / totalTxns) * 100) : 0;
    const expirationRate = totalTxns > 0 ? Math.round((txnStats.expired / totalTxns) * 100) : 0;

    // ── Stock Integrity ────────────────────────────────────────────────
    const stockRecords = await db
        .select({
            total: sql<number>`COUNT(*)::int`.as("total"),
            negative: sql<number>`COUNT(*) FILTER (WHERE ${stock.quantity} < 0)::int`.as("negative"),
            zero: sql<number>`COUNT(*) FILTER (WHERE ${stock.quantity} = 0)::int`.as("zero"),
        })
        .from(stock);

    const totalStock = stockRecords[0]?.total || 0;
    const negativeStock = stockRecords[0]?.negative || 0;
    const zeroStock = stockRecords[0]?.zero || 0;

    // Count stock corrections from audit log
    const [correctionCount] = await db
        .select({
            count: sql<number>`COUNT(*)::int`.as("count"),
        })
        .from(auditLog)
        .where(eq(auditLog.action, "STOCK_CORRECTED"));

    const corrections = correctionCount?.count || 0;
    const negativeStockRate = totalStock > 0 ? Math.round((negativeStock / totalStock) * 100) : 0;

    // ── Audit Activity ─────────────────────────────────────────────────
    const [auditStats] = await db
        .select({
            total: sql<number>`COUNT(*)::int`.as("total"),
            last7: sql<number>`COUNT(*) FILTER (WHERE ${auditLog.createdAt} >= NOW() - INTERVAL '7 days')::int`.as("last7"),
            last30: sql<number>`COUNT(*) FILTER (WHERE ${auditLog.createdAt} >= NOW() - INTERVAL '30 days')::int`.as("last30"),
        })
        .from(auditLog);

    // ── Composite Score ────────────────────────────────────────────────
    // Weighted: completeness 40%, transaction health 30%, stock integrity 30%
    const txnHealthScore = 100 - rejectionRate - expirationRate;
    const stockScore = 100 - negativeStockRate;
    const overallScore = Math.round(
        completenessRate * 0.4 +
        Math.max(0, txnHealthScore) * 0.3 +
        Math.max(0, stockScore) * 0.3,
    );

    return {
        traderCompleteness: {
            total: totalTraders,
            missingPhone,
            missingTin,
            missingBusinessName,
            completenessRate,
        },
        transactionHealth: {
            total: totalTxns,
            rejected: txnStats?.rejected || 0,
            expired: txnStats?.expired || 0,
            rejectionRate,
            expirationRate,
        },
        stockIntegrity: {
            totalRecords: totalStock,
            negativeStock,
            zeroStock,
            corrections,
            negativeStockRate,
        },
        auditActivity: {
            totalEntries: auditStats?.total || 0,
            last7Days: auditStats?.last7 || 0,
            last30Days: auditStats?.last30 || 0,
        },
        overallScore,
    };
}
