"use server";

import { eq, sql, desc, and, gte, lte } from "drizzle-orm";
import db from "@/db/drizzle";
import { user, vatRecord, taxPayment, transaction } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// VAT summary by period
// ---------------------------------------------------------------------------

export async function getVATSummaryByMonth() {
    await requireRRASession("reporting_officer", "director_executive", "data_ai_analyst");

    const monthlyVat = await db
        .select({
            month: sql<string>`TO_CHAR(${vatRecord.createdAt}, 'YYYY-MM')`.as("month"),
            vatType: vatRecord.vatType,
            total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as("total"),
        })
        .from(vatRecord)
        .groupBy(sql`TO_CHAR(${vatRecord.createdAt}, 'YYYY-MM')`, vatRecord.vatType)
        .orderBy(sql`TO_CHAR(${vatRecord.createdAt}, 'YYYY-MM')`);

    // Group into { month, generated, paid }
    const monthMap = new Map<string, { generated: number; paid: number }>();
    for (const row of monthlyVat) {
        const existing = monthMap.get(row.month) || { generated: 0, paid: 0 };
        if (row.vatType === "output") existing.generated = row.total;
        if (row.vatType === "input") existing.paid = row.total;
        monthMap.set(row.month, existing);
    }

    return Array.from(monthMap.entries()).map(([month, data]) => ({
        month,
        generated: data.generated,
        paid: data.paid,
        net: data.generated - data.paid,
    }));
}

// ---------------------------------------------------------------------------
// Per-trader tax report
// ---------------------------------------------------------------------------

export async function getTraderTaxReport(traderId: string) {
    await requireRRASession("reporting_officer", "director_executive", "data_ai_analyst");

    const [traderInfo] = await db
        .select({
            id: user.id,
            businessName: user.businessName,
            tinNumber: user.tinNumber,
            role: user.role,
        })
        .from(user)
        .where(eq(user.id, traderId))
        .limit(1);

    if (!traderInfo) return null;

    const [vatAgg, paymentAgg, txnAgg] = await Promise.all([
        db
            .select({
                vatType: vatRecord.vatType,
                total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as("total"),
            })
            .from(vatRecord)
            .where(eq(vatRecord.businessId, traderId))
            .groupBy(vatRecord.vatType),
        db
            .select({
                totalPaid: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as("total_paid"),
                count: sql<number>`COUNT(*)`.as("count"),
            })
            .from(taxPayment)
            .where(
                and(
                    eq(taxPayment.businessId, traderId),
                    eq(taxPayment.status, "confirmed"),
                ),
            ),
        db
            .select({
                totalValue: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`.as("total_value"),
                count: sql<number>`COUNT(*)`.as("count"),
            })
            .from(transaction)
            .where(eq(transaction.sellerId, traderId)),
    ]);

    const vatOutput = Number(vatAgg.find((r) => r.vatType === "output")?.total) || 0;
    const vatInput = Number(vatAgg.find((r) => r.vatType === "input")?.total) || 0;
    const netVatDue = Math.max(0, vatOutput - vatInput);
    const totalPaid = Number(paymentAgg[0]?.totalPaid) || 0;

    return {
        trader: traderInfo,
        vatOutput,
        vatInput,
        netVatDue,
        totalPaid,
        outstanding: Math.max(0, netVatDue - totalPaid),
        compliancePct: netVatDue === 0 ? 100 : Math.round((totalPaid / netVatDue) * 1000) / 10,
        transactions: {
            count: Number(txnAgg[0]?.count) || 0,
            totalValue: Number(txnAgg[0]?.totalValue) || 0,
        },
        paymentCount: Number(paymentAgg[0]?.count) || 0,
    };
}
