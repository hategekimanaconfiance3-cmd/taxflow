"use server";

import { sql, eq, desc } from "drizzle-orm";
import db from "@/db/drizzle";
import { user, vatRecord, transaction } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";
import { sendNotificationToTrader } from "@/lib/actions/admin-notification.action";
import { logAudit } from "@/lib/audit";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComplianceAlert = {
    traderId: string;
    traderName: string;
    role: string;
    alertType: "overdue_vat" | "low_compliance" | "no_recent_activity" | "negative_stock";
    severity: "low" | "medium" | "high" | "critical";
    description: string;
};

// ---------------------------------------------------------------------------
// Generate compliance alerts based on system-wide checks
// ---------------------------------------------------------------------------

export async function generateComplianceAlerts(): Promise<ComplianceAlert[]> {
    await requireRRASession("compliance_officer");

    const alerts: ComplianceAlert[] = [];

    // Get all traders
    const traders = await db
        .select({
            id: user.id,
            name: user.name,
            businessName: user.businessName,
            role: user.role,
        })
        .from(user)
        .where(sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`);

    // Get VAT data per trader
    const vatData = await db
        .select({
            businessId: vatRecord.businessId,
            outputTotal: sql<number>`COALESCE(SUM(CASE WHEN ${vatRecord.vatType} = 'output' THEN ${vatRecord.amount} ELSE 0 END), 0)::float8`.as("output_total"),
            inputTotal: sql<number>`COALESCE(SUM(CASE WHEN ${vatRecord.vatType} = 'input' THEN ${vatRecord.amount} ELSE 0 END), 0)::float8`.as("input_total"),
        })
        .from(vatRecord)
        .groupBy(vatRecord.businessId);

    const vatMap = new Map(
        vatData.map((v) => [v.businessId, { output: v.outputTotal, input: v.inputTotal }]),
    );

    // Get last transaction date per seller
    const lastTxn = await db
        .select({
            sellerId: transaction.sellerId,
            lastDate: sql<Date>`MAX(${transaction.createdAt})`.as("last_date"),
            txnCount: sql<number>`COUNT(*)`.as("txn_count"),
        })
        .from(transaction)
        .groupBy(transaction.sellerId);

    const txnMap = new Map(
        lastTxn.map((t) => [t.sellerId, { lastDate: t.lastDate, count: t.txnCount }]),
    );

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const t of traders) {
        const name = t.businessName ?? t.name;
        const vat = vatMap.get(t.id);
        const txn = txnMap.get(t.id);

        // 1. Overdue VAT: output > input (net VAT owed & significant)
        if (vat) {
            const netDue = vat.output - vat.input;
            if (netDue > 100000) {
                alerts.push({
                    traderId: t.id,
                    traderName: name,
                    role: t.role ?? "unknown",
                    alertType: "overdue_vat",
                    severity: netDue > 500000 ? "critical" : netDue > 200000 ? "high" : "medium",
                    description: `Outstanding net VAT of RWF ${netDue.toLocaleString()}.`,
                });
            }
        }

        // 2. No recent activity: no transactions in last 30 days
        if (txn && txn.count > 0) {
            const lastDate = new Date(txn.lastDate);
            if (lastDate < thirtyDaysAgo) {
                alerts.push({
                    traderId: t.id,
                    traderName: name,
                    role: t.role ?? "unknown",
                    alertType: "no_recent_activity",
                    severity: "low",
                    description: `No transactions since ${lastDate.toLocaleDateString()}.`,
                });
            }
        } else if (!txn) {
            alerts.push({
                traderId: t.id,
                traderName: name,
                role: t.role ?? "unknown",
                alertType: "no_recent_activity",
                severity: "medium",
                description: "No transaction history at all.",
            });
        }
    }

    // Sort by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return alerts;
}

// ---------------------------------------------------------------------------
// Send compliance alert notification to a trader
// ---------------------------------------------------------------------------

export async function sendComplianceAlert(
    traderId: string,
    alertType: string,
    description: string,
) {
    const { staff, ...session } = await requireRRASession("compliance_officer");

    await sendNotificationToTrader(
        traderId,
        "Compliance Alert",
        description,
        "/dashboard/tax",
    );

    await logAudit({
        userId: session.user.id,
        action: "COMPLIANCE_ALERT_SENT",
        targetType: "user",
        targetId: traderId,
        metadata: {
            alertType,
            description,
            sentBy: staff.staffId,
        },
    });

    return { success: true };
}
