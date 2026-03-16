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

export type UnpaidTrader = {
    traderId: string;
    traderName: string;
    role: string;
    totalVatDue: number;
    totalPaid: number;
    outstanding: number;
};

// ---------------------------------------------------------------------------
// Get traders with outstanding VAT
// ---------------------------------------------------------------------------

export async function getTradersWithUnpaidVat(): Promise<UnpaidTrader[]> {
    await requireRRASession("compliance_officer");

    // VAT due per business from vatRecord
    const vatDue = await db
        .select({
            businessId: vatRecord.businessId,
            totalDue: sql<number>`COALESCE(SUM(CASE WHEN ${vatRecord.vatType} = 'output' THEN ${vatRecord.amount} ELSE 0 END) - SUM(CASE WHEN ${vatRecord.vatType} = 'input' THEN ${vatRecord.amount} ELSE 0 END), 0)`.as(
                "total_due",
            ),
        })
        .from(vatRecord)
        .groupBy(vatRecord.businessId);

    // Get trader details
    const traders = await db
        .select({
            id: user.id,
            name: user.name,
            businessName: user.businessName,
            role: user.role,
        })
        .from(user)
        .where(
            sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
        );

    const vatMap = new Map(vatDue.map((v) => [v.businessId, v.totalDue]));

    const results: UnpaidTrader[] = traders
        .map((t) => {
            const totalDue = vatMap.get(t.id) ?? 0;
            return {
                traderId: t.id,
                traderName: t.businessName ?? t.name,
                role: t.role ?? "unknown",
                totalVatDue: totalDue > 0 ? totalDue : 0,
                totalPaid: 0,
                outstanding: totalDue > 0 ? totalDue : 0,
            };
        })
        .filter((t) => t.outstanding > 0)
        .sort((a, b) => b.outstanding - a.outstanding);

    return results;
}

// ---------------------------------------------------------------------------
// Send payment reminder to a specific trader
// ---------------------------------------------------------------------------

export async function sendPaymentReminder(
    traderId: string,
    amount: number,
) {
    const { staff, ...session } = await requireRRASession("compliance_officer", "audit_officer");

    await sendNotificationToTrader(
        traderId,
        "VAT Payment Reminder",
        `You have an outstanding VAT balance of RWF ${amount.toLocaleString()}. Please make your payment promptly to avoid penalties.`,
        "/dashboard/payments",
    );

    await logAudit({
        userId: session.user.id,
        action: "PAYMENT_REMINDER_SENT",
        targetType: "user",
        targetId: traderId,
        metadata: {
            amount,
            sentBy: staff.staffId,
        },
    });

    return { success: true };
}

// ---------------------------------------------------------------------------
// Send bulk reminders to all traders with outstanding VAT
// ---------------------------------------------------------------------------

export async function sendBulkPaymentReminders() {
    const { staff, ...session } = await requireRRASession("super_admin");

    const unpaid = await getTradersWithUnpaidVat();

    let sent = 0;
    for (const t of unpaid) {
        await sendNotificationToTrader(
            t.traderId,
            "VAT Payment Reminder",
            `You have an outstanding VAT balance of RWF ${t.outstanding.toLocaleString()}. Please make your payment to avoid penalties.`,
            "/dashboard/payments",
        );
        sent++;
    }

    await logAudit({
        userId: session.user.id,
        action: "BULK_PAYMENT_REMINDERS_SENT",
        targetType: "system",
        targetId: "all",
        metadata: {
            tradersNotified: sent,
            sentBy: staff.staffId,
        },
    });

    return { sent };
}
