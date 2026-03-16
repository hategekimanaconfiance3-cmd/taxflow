"use server";

import { sql, eq, desc } from "drizzle-orm";
import db from "@/db/drizzle";
import { transaction, vatRecord, user, product } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VatDiscrepancy = {
    traderId: string;
    traderName: string;
    role: string;
    declaredOutput: number;
    declaredInput: number;
    actualOutput: number;
    actualInput: number;
    outputDiscrepancy: number;
    inputDiscrepancy: number;
    totalDiscrepancy: number;
    discrepancyPct: number;
    status: "matching" | "minor" | "significant" | "critical";
};

// ---------------------------------------------------------------------------
// Compare declared VAT vs actual transaction-based VAT across all traders
// ---------------------------------------------------------------------------

export async function getVatVerification(): Promise<VatDiscrepancy[]> {
    await requireRRASession("compliance_officer", "audit_officer");

    // 1. Get declared VAT from vatRecord table (grouped by user + type)
    const declaredVat = await db
        .select({
            businessId: vatRecord.businessId,
            vatType: vatRecord.vatType,
            total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)`.as("total"),
        })
        .from(vatRecord)
        .groupBy(vatRecord.businessId, vatRecord.vatType);

    // 2. Get actual VAT from transactions (sales = output, purchases = input)
    const actualSalesVat = await db
        .select({
            sellerId: transaction.sellerId,
            total: sql<number>`COALESCE(SUM(${transaction.vatAmount}), 0)`.as("total"),
        })
        .from(transaction)
        .where(sql`${transaction.status} IN ('confirmed', 'completed')`)
        .groupBy(transaction.sellerId);

    const actualPurchaseVat = await db
        .select({
            buyerId: transaction.buyerId,
            total: sql<number>`COALESCE(SUM(${transaction.vatAmount}), 0)`.as("total"),
        })
        .from(transaction)
        .where(
            sql`${transaction.status} IN ('confirmed', 'completed') AND ${transaction.buyerId} IS NOT NULL`,
        )
        .groupBy(transaction.buyerId);

    // 3. Get trader info
    const traders = await db
        .select({
            id: user.id,
            name: user.name,
            businessName: user.businessName,
            role: user.role,
        })
        .from(user)
        .where(sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`);

    // Build maps
    const declaredMap = new Map<string, { output: number; input: number }>();
    for (const d of declaredVat) {
        const existing = declaredMap.get(d.businessId) ?? { output: 0, input: 0 };
        if (d.vatType === "output") existing.output = d.total;
        else if (d.vatType === "input") existing.input = d.total;
        declaredMap.set(d.businessId, existing);
    }

    const actualOutputMap = new Map(
        actualSalesVat.map((s) => [s.sellerId, s.total]),
    );
    const actualInputMap = new Map(
        actualPurchaseVat.map((p) => [p.buyerId, p.total]),
    );

    // 4. Calculate discrepancies
    const results: VatDiscrepancy[] = traders.map((t) => {
        const declared = declaredMap.get(t.id) ?? { output: 0, input: 0 };
        const actualOut = actualOutputMap.get(t.id) ?? 0;
        const actualIn = actualInputMap.get(t.id) ?? 0;

        const outDisc = Math.abs(declared.output - actualOut);
        const inDisc = Math.abs(declared.input - actualIn);
        const totalDisc = outDisc + inDisc;
        const totalDeclared = declared.output + declared.input;
        const pct = totalDeclared > 0 ? Math.round((totalDisc / totalDeclared) * 100) : 0;

        let status: VatDiscrepancy["status"] = "matching";
        if (pct > 20) status = "critical";
        else if (pct > 10) status = "significant";
        else if (pct > 2) status = "minor";

        return {
            traderId: t.id,
            traderName: t.businessName ?? t.name,
            role: t.role ?? "unknown",
            declaredOutput: declared.output,
            declaredInput: declared.input,
            actualOutput: actualOut,
            actualInput: actualIn,
            outputDiscrepancy: outDisc,
            inputDiscrepancy: inDisc,
            totalDiscrepancy: totalDisc,
            discrepancyPct: pct,
            status,
        };
    });

    // Sort: critical first
    results.sort((a, b) => {
        const order = { critical: 0, significant: 1, minor: 2, matching: 3 };
        return order[a.status] - order[b.status] || b.totalDiscrepancy - a.totalDiscrepancy;
    });

    return results;
}
