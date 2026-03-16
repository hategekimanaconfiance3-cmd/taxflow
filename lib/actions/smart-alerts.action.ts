"use server";

import { sql, and, gte, eq, desc } from "drizzle-orm";
import db from "@/db/drizzle";
import { transaction, stock, vatRecord, taxPayment, auditLog, user } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// Smart Alerts — automated suspicious activity detection
// ---------------------------------------------------------------------------

export interface SmartAlert {
    id: string;
    type: "below_cost" | "unrealistic_production" | "vat_mismatch" | "transaction_spike" | "negative_stock" | "compliance_flag";
    severity: "critical" | "warning" | "info";
    title: string;
    description: string;
    traderId: string;
    traderName: string;
    detectedAt: string;
}

export interface SmartAlertsData {
    alerts: SmartAlert[];
    totalCount: number;
    criticalCount: number;
    warningCount: number;
}

/**
 * Generate smart alerts from various fraud detection signals.
 */
export async function getSmartAlerts(): Promise<SmartAlertsData> {
    await requireRRASession();

    const alerts: SmartAlert[] = [];

    try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        // 1. Negative stock alerts (critical)
        const negStocks = await db
            .select({
                businessId: stock.businessId,
                traderName: user.businessName,
                quantity: stock.quantity,
            })
            .from(stock)
            .innerJoin(user, eq(stock.businessId, user.id))
            .where(sql`${stock.quantity} < 0`)
            .limit(10);

        for (const ns of negStocks) {
            alerts.push({
                id: `neg-${ns.businessId}`,
                type: "negative_stock",
                severity: "critical",
                title: "Negative stock detected",
                description: `${ns.traderName ?? "Unknown"} has ${ns.quantity} units — possible data manipulation`,
                traderId: ns.businessId,
                traderName: ns.traderName ?? "Unknown",
                detectedAt: new Date().toISOString(),
            });
        }

        // 2. VAT mismatch — traders where output VAT >> input VAT unusually
        const vatSummary = await db
            .select({
                businessId: vatRecord.businessId,
                vatType: vatRecord.vatType,
                total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)`.as("total"),
            })
            .from(vatRecord)
            .where(gte(vatRecord.createdAt, sevenDaysAgo))
            .groupBy(vatRecord.businessId, vatRecord.vatType);

        const vatByTrader = new Map<string, { input: number; output: number }>();
        for (const v of vatSummary) {
            const existing = vatByTrader.get(v.businessId) ?? { input: 0, output: 0 };
            if (v.vatType === "input") existing.input = v.total;
            if (v.vatType === "output") existing.output = v.total;
            vatByTrader.set(v.businessId, existing);
        }

        // Get trader names for VAT mismatch alerts
        const traderIds = [...vatByTrader.keys()];
        const traderNames = traderIds.length > 0 ? await db
            .select({ id: user.id, name: user.businessName })
            .from(user)
            .where(sql`${user.id} IN (${sql.join(traderIds.map((id) => sql`${id}`), sql`, `)})`) : [];
        const nameMap = new Map(traderNames.map((t) => [t.id, t.name]));

        for (const [businessId, vat] of vatByTrader) {
            // Large output with zero input = suspicious
            if (vat.output > 0 && vat.input === 0 && vat.output > 100000) {
                alerts.push({
                    id: `vat-${businessId}`,
                    type: "vat_mismatch",
                    severity: "warning",
                    title: "VAT mismatch detected",
                    description: `${nameMap.get(businessId) ?? "Unknown"} has output VAT but no input VAT this week`,
                    traderId: businessId,
                    traderName: nameMap.get(businessId) ?? "Unknown",
                    detectedAt: new Date().toISOString(),
                });
            }
        }

        // 3. Transaction spike alerts
        const dailyCounts = await db
            .select({
                sellerId: transaction.sellerId,
                sellerName: user.businessName,
                dayCount: sql<number>`COUNT(*)::int`.as("day_count"),
            })
            .from(transaction)
            .innerJoin(user, eq(transaction.sellerId, user.id))
            .where(
                and(
                    sql`${transaction.createdAt} >= CURRENT_DATE`,
                ),
            )
            .groupBy(transaction.sellerId, user.businessName);

        // Get 30-day averages
        const avgCounts = await db
            .select({
                sellerId: transaction.sellerId,
                avgDaily: sql<number>`(COUNT(*)::float / 30)`.as("avg_daily"),
            })
            .from(transaction)
            .where(gte(transaction.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))
            .groupBy(transaction.sellerId);

        const avgMap = new Map(avgCounts.map((a) => [a.sellerId, a.avgDaily]));

        for (const dc of dailyCounts) {
            const avg = avgMap.get(dc.sellerId) ?? 0;
            if (avg > 0 && dc.dayCount > avg * 3 && dc.dayCount > 5) {
                alerts.push({
                    id: `spike-${dc.sellerId}`,
                    type: "transaction_spike",
                    severity: "warning",
                    title: "Abnormal transaction spike",
                    description: `${dc.sellerName ?? "Unknown"} has ${dc.dayCount} transactions today (avg: ${Math.round(avg)}/day)`,
                    traderId: dc.sellerId,
                    traderName: dc.sellerName ?? "Unknown",
                    detectedAt: new Date().toISOString(),
                });
            }
        }

        // 4. Recent compliance flags from audit log
        const recentFlags = await db
            .select({
                id: auditLog.id,
                userId: auditLog.userId,
                action: auditLog.action,
                createdAt: auditLog.createdAt,
                userName: user.businessName,
            })
            .from(auditLog)
            .innerJoin(user, eq(auditLog.userId, user.id))
            .where(
                and(
                    sql`${auditLog.action} IN ('PRICE_ABOVE_CEILING', 'CLEARANCE_SUSPENDED', 'COMPLIANCE_ALERT', 'SUSPICIOUS_ACTIVITY')`,
                    gte(auditLog.createdAt, sevenDaysAgo),
                ),
            )
            .orderBy(desc(auditLog.createdAt))
            .limit(5);

        for (const flag of recentFlags) {
            alerts.push({
                id: `flag-${flag.id}`,
                type: "compliance_flag",
                severity: "info",
                title: flag.action.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
                description: `${flag.userName ?? "Unknown"} — flagged by system`,
                traderId: flag.userId,
                traderName: flag.userName ?? "Unknown",
                detectedAt: flag.createdAt?.toISOString() ?? new Date().toISOString(),
            });
        }

        // Sort by severity
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

        return {
            alerts: alerts.slice(0, 15),
            totalCount: alerts.length,
            criticalCount: alerts.filter((a) => a.severity === "critical").length,
            warningCount: alerts.filter((a) => a.severity === "warning").length,
        };
    } catch (error) {
        console.error("Smart alerts error:", error);
        return { alerts: [], totalCount: 0, criticalCount: 0, warningCount: 0 };
    }
}
