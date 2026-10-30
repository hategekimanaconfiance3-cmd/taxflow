"use server";

import { eq, desc, sql, and } from "drizzle-orm";
import db from "@/db/drizzle";
import { auditLog, taxPayment, taxPaymentEvent, user } from "@/db/schema";
import { requireRRAPermission } from "@/lib/auth-guard";
import { assertPaymentTransition, type PaymentStatus } from "@/lib/payment-engine/domain";
import { taxPaymentRejectionSchema } from "@/lib/validation/tax-payment.schema";

// ---------------------------------------------------------------------------
// Get all payments with trader info
// ---------------------------------------------------------------------------

export async function getAllPayments(filter?: "all" | "pending" | "confirmed" | "rejected") {
    await requireRRAPermission("payments.read");

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
            paymentReference: taxPayment.paymentReference,
            reference: taxPayment.reference,
            status: taxPayment.status,
            workflowStatus: taxPayment.workflowStatus,
            createdAt: taxPayment.createdAt,
            businessId: taxPayment.businessId,
            businessName: user.businessName,
            traderName: user.name,
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
    await requireRRAPermission("payments.read");

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
    input: unknown,
    status: "rejected",
) {
    const session = await requireRRAPermission("payments.reconcile");
    const parsed = taxPaymentRejectionSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Payment rejection details are invalid.");
    const { paymentId, reason } = parsed.data;
    await db.transaction(async (tx) => {
        const [payment] = await tx
            .select()
            .from(taxPayment)
            .where(eq(taxPayment.id, paymentId))
            .for("update")
            .limit(1);
        if (!payment) throw new Error("Payment not found.");
        if (payment.status !== "pending") throw new Error("Only pending payments can be reviewed.");
        assertPaymentTransition(payment.workflowStatus as PaymentStatus, "FAILED");

        const [lockedUser] = await tx
            .select({ id: user.id })
            .from(user)
            .where(eq(user.id, payment.businessId))
            .for("update")
            .limit(1);
        if (!lockedUser) throw new Error("Taxpayer not found.");

        const [updated] = await tx
            .update(taxPayment)
            .set({ status, workflowStatus: "FAILED" })
            .where(and(eq(taxPayment.id, paymentId), eq(taxPayment.status, "pending")))
            .returning({ id: taxPayment.id });
        if (!updated) throw new Error("Payment status changed; review was not applied.");

        await tx.insert(auditLog).values({
            userId: session.user.id,
            action: "TAX_PAYMENT_REJECTED",
            targetType: "tax_payment",
            targetId: paymentId,
            beforeState: { status: payment.status },
            afterState: { status },
            metadata: JSON.stringify({
                businessId: payment.businessId,
                amount: payment.amount,
                previousStatus: payment.status,
                status,
                reason,
            }),
        });

        await tx.insert(taxPaymentEvent).values({
            paymentId: payment.id,
            eventKey: `${payment.id}:rejected:${session.user.id}`,
            eventType: "PAYMENT_REJECTED",
            fromStatus: payment.workflowStatus,
            toStatus: "FAILED",
            actorUserId: session.user.id,
            details: { reason },
        });
    });

    return { success: true };
}
