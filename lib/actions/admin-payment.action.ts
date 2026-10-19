"use server";

import { eq, desc, sql, and, ilike } from "drizzle-orm";
import db from "@/db/drizzle";
import { auditLog, taxPayment, user, vatRecord } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// Get all payments with trader info
// ---------------------------------------------------------------------------

export async function getAllPayments(filter?: "all" | "pending" | "confirmed" | "rejected") {
    await requireRRASession("compliance_officer", "reporting_officer", "payments_reconciliation_officer");

    const conditions = [
        sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
    ];
    if (filter && filter !== "all") {
        conditions.push(eq(taxPayment.status, filter));
    }

    const payments = await db
        .select({
            id: taxPayment.id,
            amount: taxPayment.amount,
            method: taxPayment.method,
            reference: taxPayment.reference,
            status: taxPayment.status,
            createdAt: taxPayment.createdAt,
            businessId: taxPayment.businessId,
            businessName: user.businessName,
            tinNumber: user.tinNumber,
            role: user.role,
        })
        .from(taxPayment)
        .innerJoin(user, eq(taxPayment.businessId, user.id))
        .where(and(...conditions))
        .orderBy(desc(taxPayment.createdAt));

    return payments;
}

// ---------------------------------------------------------------------------
// Payment summary stats
// ---------------------------------------------------------------------------

export async function getPaymentSummary() {
    await requireRRASession("compliance_officer", "reporting_officer", "payments_reconciliation_officer");

    const [totals] = await db
        .select({
            totalCollected: sql<number>`COALESCE(SUM(CASE WHEN ${taxPayment.status} = 'confirmed' THEN ${taxPayment.amount} ELSE 0 END), 0)::float8`.as("total_collected"),
            totalPending: sql<number>`COALESCE(SUM(CASE WHEN ${taxPayment.status} = 'pending' THEN ${taxPayment.amount} ELSE 0 END), 0)::float8`.as("total_pending"),
            countAll: sql<number>`COUNT(*)`.as("count_all"),
            countPending: sql<number>`COUNT(*) FILTER (WHERE ${taxPayment.status} = 'pending')`.as("count_pending"),
            countConfirmed: sql<number>`COUNT(*) FILTER (WHERE ${taxPayment.status} = 'confirmed')`.as("count_confirmed"),
            countRejected: sql<number>`COUNT(*) FILTER (WHERE ${taxPayment.status} = 'rejected')`.as("count_rejected"),
        })
        .from(taxPayment);

    return {
        totalCollected: totals?.totalCollected ?? 0,
        totalPending: totals?.totalPending ?? 0,
        countAll: totals?.countAll ?? 0,
        countPending: totals?.countPending ?? 0,
        countConfirmed: totals?.countConfirmed ?? 0,
        countRejected: totals?.countRejected ?? 0,
    };
}

// ---------------------------------------------------------------------------
// Confirm / reject a payment
// ---------------------------------------------------------------------------

export async function updatePaymentStatus(
    paymentId: string,
    status: "confirmed" | "rejected",
) {
    const session = await requireRRASession("compliance_officer", "audit_officer", "payments_reconciliation_officer");

    await db.transaction(async (tx) => {
        const [payment] = await tx
            .select()
            .from(taxPayment)
            .where(eq(taxPayment.id, paymentId))
            .for("update")
            .limit(1);
        if (!payment) throw new Error("Payment not found.");
        if (payment.status !== "pending") throw new Error("Only pending payments can be reviewed.");

        const [lockedUser] = await tx
            .select({ id: user.id })
            .from(user)
            .where(eq(user.id, payment.businessId))
            .for("update")
            .limit(1);
        if (!lockedUser) throw new Error("Taxpayer not found.");

        if (status === "confirmed") {
            const vatTotals = await tx
                .select({
                    vatType: vatRecord.vatType,
                    total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as("total"),
                })
                .from(vatRecord)
                .where(and(eq(vatRecord.businessId, payment.businessId), eq(vatRecord.isFrozen, false)))
                .groupBy(vatRecord.vatType);
            const output = Number(vatTotals.find((row) => row.vatType === "output")?.total) || 0;
            const input = Number(vatTotals.find((row) => row.vatType === "input")?.total) || 0;
            const [paidRow] = await tx
                .select({ total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as("total") })
                .from(taxPayment)
                .where(and(eq(taxPayment.businessId, payment.businessId), eq(taxPayment.status, "confirmed")));
            const outstanding = Math.max(0, output - input - (Number(paidRow?.total) || 0));
            if (payment.amount > outstanding) {
                throw new Error("Payment exceeds the taxpayer's current outstanding balance.");
            }
        }

        const [updated] = await tx
            .update(taxPayment)
            .set({ status })
            .where(and(eq(taxPayment.id, paymentId), eq(taxPayment.status, "pending")))
            .returning({ id: taxPayment.id });
        if (!updated) throw new Error("Payment status changed; review was not applied.");

        await tx.insert(auditLog).values({
            userId: session.user.id,
            action: status === "confirmed" ? "TAX_PAYMENT_CONFIRMED" : "TAX_PAYMENT_REJECTED",
            targetType: "tax_payment",
            targetId: paymentId,
            beforeState: { status: payment.status },
            afterState: { status },
            metadata: JSON.stringify({
                businessId: payment.businessId,
                amount: payment.amount,
                previousStatus: payment.status,
                status,
            }),
        });
    });

    return { success: true };
}
