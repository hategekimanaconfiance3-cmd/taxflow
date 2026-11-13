"use server";

import { sql } from "drizzle-orm";
import db from "@/db/drizzle";
import { user, vatRecord, taxPayment, transaction, stock, auditLog } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// Risk Heatmap — groups all traders by risk tier
// ---------------------------------------------------------------------------

export interface RiskHeatmapData {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
    topRiskTraders: {
        id: string;
        name: string;
        score: number;
        level: "critical" | "high" | "medium" | "low";
        topReason: string;
    }[];
}

/**
 * Compute a lightweight risk heatmap by scoring all traders.
 * Uses a simplified scoring approach (tax compliance + historical flags)
 * for speed, rather than the full 5-signal engine.
 */
export async function getRiskHeatmap(): Promise<RiskHeatmapData> {
    await requireRRASession("super_admin", "compliance_officer", "audit_officer", "tax_compliance_officer", "audit_investigation_officer", "data_ai_analyst");

    try {
        // Get all traders
        const traders = await db
            .select({
                id: user.id,
                name: user.businessName,
            })
            .from(user)
            .where(sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`);

        if (traders.length === 0) {
            return { critical: 0, high: 0, medium: 0, low: 0, total: 0, topRiskTraders: [] };
        }

        // Batch: get all VAT output per trader
        const vatOwed = await db
            .select({
                businessId: vatRecord.businessId,
                total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as("total"),
            })
            .from(vatRecord)
            .where(sql`${vatRecord.vatType} = 'output'`)
            .groupBy(vatRecord.businessId);

        // Batch: get all payments per trader
        const paid = await db
            .select({
                businessId: taxPayment.businessId,
                total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as("total"),
            })
            .from(taxPayment)
            .where(sql`${taxPayment.status} = 'confirmed'`)
            .groupBy(taxPayment.businessId);

        // Batch: get flag counts per trader (last 90 days)
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const flags = await db
            .select({
                userId: auditLog.userId,
                count: sql<number>`COUNT(*)::int`.as("count"),
            })
            .from(auditLog)
            .where(sql`${auditLog.action} IN ('PRICE_ABOVE_CEILING', 'CLEARANCE_SUSPENDED', 'COMPLIANCE_ALERT', 'SUSPICIOUS_ACTIVITY') AND ${auditLog.createdAt} >= ${ninetyDaysAgo}`)
            .groupBy(auditLog.userId);

        // Batch: negative stock count per trader
        const negStock = await db
            .select({
                businessId: stock.businessId,
                count: sql<number>`COUNT(*)::int`.as("count"),
            })
            .from(stock)
            .where(sql`${stock.quantity} < 0`)
            .groupBy(stock.businessId);

        const owedMap = new Map(vatOwed.map((v) => [v.businessId, v.total]));
        const paidMap = new Map(paid.map((p) => [p.businessId, p.total]));
        const flagMap = new Map(flags.map((f) => [f.userId, f.count]));
        const negStockMap = new Map(negStock.map((n) => [n.businessId, n.count]));

        // Score traders
        const scored = traders.map((t) => {
            const owed = owedMap.get(t.id) ?? 0;
            const paidAmt = paidMap.get(t.id) ?? 0;
            const flagCount = flagMap.get(t.id) ?? 0;
            const negStockCount = negStockMap.get(t.id) ?? 0;

            // Tax compliance score (0-50)
            let taxScore = 0;
            if (owed > 0) {
                const compliancePct = Math.min(100, (paidAmt / owed) * 100);
                taxScore = Math.round(Math.max(0, 50 - (compliancePct / 2)));
            }

            // Flag score (0-30)
            const flagScore = Math.min(30, flagCount * 10);

            // Negative stock score (0-20)
            const stockScore = negStockCount > 0 ? 20 : 0;

            const total = Math.min(100, taxScore + flagScore + stockScore);
            const level: "critical" | "high" | "medium" | "low" =
                total >= 75 ? "critical" :
                total >= 50 ? "high" :
                total >= 25 ? "medium" : "low";

            // Determine top reason
            let topReason = "Clean record";
            if (stockScore > 0) topReason = "Negative stock detected";
            else if (flagScore >= 20) topReason = `${flagCount} compliance flags`;
            else if (taxScore >= 25) topReason = `Low tax compliance (${owed > 0 ? Math.round((paidAmt / owed) * 100) : 0}% paid)`;
            else if (flagScore > 0) topReason = `${flagCount} flag(s) in 90 days`;

            return {
                id: t.id,
                name: t.name ?? "Unknown",
                score: total,
                level,
                topReason,
            };
        });

        const counts = { critical: 0, high: 0, medium: 0, low: 0 };
        for (const s of scored) {
            counts[s.level]++;
        }

        // Top 10 risk traders
        const topRiskTraders = scored
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);

        return {
            ...counts,
            total: scored.length,
            topRiskTraders,
        };
    } catch (error) {
        console.error("Risk heatmap error:", error);
        return { critical: 0, high: 0, medium: 0, low: 0, total: 0, topRiskTraders: [] };
    }
}
