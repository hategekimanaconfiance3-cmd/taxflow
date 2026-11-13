"use server";

import { sql, eq } from "drizzle-orm";
import db from "@/db/drizzle";
import { user, vatRecord } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";
import { sendNotificationToTrader } from "@/lib/actions/admin-notification.action";
import { logAudit } from "@/lib/audit";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UnpaidTrader = {
    traderId: string;
    traderName: string;
    role: string;
    totalVatDue: number;
    totalPaid: number;
    outstanding: number;
};

/**
 * Roles authorized to view unpaid VAT and send payment reminders.
 * Must exactly match the page guard at admin/payment-reminders/page.tsx.
 */
const REMINDER_ROLES = [
    "compliance_officer",
    "tax_compliance_officer",
    "audit_officer",
    "audit_investigation_officer",
    "payments_reconciliation_officer",
    "super_admin",
] as const;

// ---------------------------------------------------------------------------
// Get traders with outstanding VAT
// ---------------------------------------------------------------------------

export async function getTradersWithUnpaidVat(): Promise<UnpaidTrader[]> {
    await requireRRASession(...REMINDER_ROLES);

    // VAT due per business from vatRecord
    const vatDue = await db
        .select({
            businessId: vatRecord.businessId,
            totalDue: sql<number>`COALESCE(SUM(CASE WHEN ${vatRecord.vatType} = 'output' THEN ${vatRecord.amount} ELSE 0 END) - SUM(CASE WHEN ${vatRecord.vatType} = 'input' THEN ${vatRecord.amount} ELSE 0 END), 0)::float8`.as(
                "total_due",
            ),
        })
        .from(vatRecord)
        .where(eq(vatRecord.isFrozen, false))
        .groupBy(vatRecord.businessId);

    // Merge with user info
    const traders = await db
        .select({
            id: user.id,
            name: user.name,
            businessName: user.businessName,
            role: user.role,
        })
        .from(user)
        .where(sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`);

    const vatMap = new Map(vatDue.map((v) => [v.businessId, v.totalDue]));

    const result: UnpaidTrader[] = [];
    for (const t of traders) {
        const totalVatDue = vatMap.get(t.id) ?? 0;
        const outstanding = Math.max(0, totalVatDue);
        if (outstanding > 0) {
            result.push({
                traderId: t.id,
                traderName: t.businessName ?? t.name ?? "—",
                role: t.role ?? "unknown",
                totalVatDue,
                totalPaid: 0,
                outstanding,
            });
        }
    }

    result.sort((a, b) => b.outstanding - a.outstanding);
    return result;
}

// ---------------------------------------------------------------------------
// Send a payment reminder to a single trader
// ---------------------------------------------------------------------------

export async function sendPaymentReminder(traderId: string, amount: number) {
    const { staff, ...session } = await requireRRASession(...REMINDER_ROLES);

    await sendNotificationToTrader(
        traderId,
        "Payment Reminder",
        `You have an outstanding VAT balance of RWF ${amount.toLocaleString()}. Please settle your tax obligations promptly to remain compliant.`,
        "/dashboard/tax",
    );

    await logAudit({
        userId: session.user.id,
        action: "PAYMENT_REMINDER_SENT",
        targetType: "user",
        targetId: traderId,
        metadata: {
            amount,
            sentBy: staff.id,
        },
    });

    return { success: true };
}

// ---------------------------------------------------------------------------
// Send payment reminders to all traders with outstanding VAT
// ---------------------------------------------------------------------------

export async function sendBulkPaymentReminders() {
    const { staff, ...session } = await requireRRASession(...REMINDER_ROLES);

    const traders = await getTradersWithUnpaidVat();
    let sent = 0;

    for (const trader of traders) {
        try {
            await sendNotificationToTrader(
                trader.traderId,
                "Payment Reminder",
                `You have an outstanding VAT balance of RWF ${trader.outstanding.toLocaleString()}. Please settle your tax obligations promptly.`,
                "/dashboard/tax",
            );
            sent++;
        } catch {
            // Continue with remaining traders if one notification fails.
        }
    }

    await logAudit({
        userId: session.user.id,
        action: "BULK_PAYMENT_REMINDERS_SENT",
        targetType: "user",
        targetId: null,
        metadata: {
            count: sent,
            sentBy: staff.id,
        },
    });

    return { sent };
}
