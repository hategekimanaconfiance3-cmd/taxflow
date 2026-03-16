"use server";

import { sql, eq } from "drizzle-orm";
import db from "@/db/drizzle";
import { user, vatRecord, taxPayment, transaction } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgingBucket = "current" | "overdue" | "delinquent" | "critical";

export type TraderArrears = {
    traderId: string;
    traderName: string;
    role: string;
    totalOwed: number;
    totalPaid: number;
    outstanding: number;
    oldestUnpaidDate: Date | null;
    agingBucket: AgingBucket;
    daysSinceOldest: number;
};

export type ArrearsAgingSummary = {
    current: { count: number; total: number };     // 0–30 days
    overdue: { count: number; total: number };      // 31–60 days
    delinquent: { count: number; total: number };   // 61–90 days
    critical: { count: number; total: number };     // 90+ days
    traders: TraderArrears[];
    grandTotal: number;
};

// ---------------------------------------------------------------------------
// Compute aging bucket from number of days
// ---------------------------------------------------------------------------

function getAgingBucket(days: number): AgingBucket {
    if (days <= 30) return "current";
    if (days <= 60) return "overdue";
    if (days <= 90) return "delinquent";
    return "critical";
}

// ---------------------------------------------------------------------------
// Get arrears aging report
// ---------------------------------------------------------------------------

export async function getArrearsAging(): Promise<ArrearsAgingSummary> {
    await requireRRASession("compliance_officer", "audit_officer", "reporting_officer");

    // Get all traders
    const traders = await db
        .select({
            id: user.id,
            businessName: user.businessName,
            name: user.name,
            role: user.role,
        })
        .from(user)
        .where(
            sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
        );

    // Get VAT owed per trader (output - input)
    const vatData = await db
        .select({
            businessId: vatRecord.businessId,
            vatType: vatRecord.vatType,
            total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)`.as("total"),
        })
        .from(vatRecord)
        .groupBy(vatRecord.businessId, vatRecord.vatType);

    // Get payments per trader
    const payments = await db
        .select({
            businessId: taxPayment.businessId,
            totalPaid: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)`.as("total_paid"),
        })
        .from(taxPayment)
        .where(eq(taxPayment.status, "confirmed"))
        .groupBy(taxPayment.businessId);

    // Get oldest unpaid VAT output date per trader
    // (earliest VAT output record that hasn't been fully covered)
    const oldestVatDates = await db
        .select({
            businessId: vatRecord.businessId,
            oldestDate: sql<Date>`MIN(${vatRecord.createdAt})`.as("oldest_date"),
        })
        .from(vatRecord)
        .where(eq(vatRecord.vatType, "output"))
        .groupBy(vatRecord.businessId);

    // Build maps
    const vatMap = new Map<string, { output: number; input: number }>();
    for (const r of vatData) {
        const e = vatMap.get(r.businessId) || { output: 0, input: 0 };
        if (r.vatType === "output") e.output = r.total;
        if (r.vatType === "input") e.input = r.total;
        vatMap.set(r.businessId, e);
    }

    const payMap = new Map(payments.map((p) => [p.businessId, p.totalPaid]));
    const dateMap = new Map(oldestVatDates.map((d) => [d.businessId, d.oldestDate]));

    const now = Date.now();
    const arrearsList: TraderArrears[] = [];

    for (const trader of traders) {
        const vat = vatMap.get(trader.id) || { output: 0, input: 0 };
        const totalOwed = Math.max(0, vat.output - vat.input);
        const totalPaid = payMap.get(trader.id) ?? 0;
        const outstanding = Math.max(0, totalOwed - totalPaid);

        if (outstanding <= 0) continue; // No arrears

        const oldestDate = dateMap.get(trader.id) ?? null;
        const daysSinceOldest = oldestDate
            ? Math.round((now - new Date(oldestDate).getTime()) / (1000 * 60 * 60 * 24))
            : 0;

        arrearsList.push({
            traderId: trader.id,
            traderName: trader.businessName ?? trader.name,
            role: trader.role ?? "unknown",
            totalOwed,
            totalPaid,
            outstanding,
            oldestUnpaidDate: oldestDate,
            agingBucket: getAgingBucket(daysSinceOldest),
            daysSinceOldest,
        });
    }

    // Sort by days (oldest first = most critical)
    arrearsList.sort((a, b) => b.daysSinceOldest - a.daysSinceOldest);

    // Build summary buckets
    const summary: ArrearsAgingSummary = {
        current: { count: 0, total: 0 },
        overdue: { count: 0, total: 0 },
        delinquent: { count: 0, total: 0 },
        critical: { count: 0, total: 0 },
        traders: arrearsList,
        grandTotal: arrearsList.reduce((s, t) => s + t.outstanding, 0),
    };

    for (const t of arrearsList) {
        summary[t.agingBucket].count += 1;
        summary[t.agingBucket].total += t.outstanding;
    }

    return summary;
}
