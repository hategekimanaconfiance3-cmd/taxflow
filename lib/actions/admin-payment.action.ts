"use server";

import { eq, desc, sql, and, ilike } from "drizzle-orm";
import db from "@/db/drizzle";
import { taxPayment, user } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// Get all payments with trader info
// ---------------------------------------------------------------------------

export async function getAllPayments(filter?: "all" | "pending" | "confirmed" | "rejected") {
    await requireRRASession("compliance_officer", "reporting_officer");

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
    await requireRRASession("compliance_officer", "reporting_officer");

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
    await requireRRASession("compliance_officer", "audit_officer");

    await db
        .update(taxPayment)
        .set({ status })
        .where(eq(taxPayment.id, paymentId));

    return { success: true };
}
