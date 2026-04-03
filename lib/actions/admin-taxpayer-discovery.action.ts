"use server";

import { sql, eq, desc } from "drizzle-orm";
import db from "@/db/drizzle";
import { user, transaction, importDeclaration, product } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UnregisteredBuyer = {
    buyerName: string;
    transactionCount: number;
    totalValue: number;
    lastSeenAt: Date;
    sellerNames: string[];
};

export type RegistrationTimeliness = {
    traderId: string;
    traderName: string;
    role: string;
    registeredAt: Date;
    firstTransactionAt: Date | null;
    daysBetween: number | null;
};

// ---------------------------------------------------------------------------
// Detect unregistered buyers from retail (consumer) transactions
// ---------------------------------------------------------------------------

/**
 * Find unique buyerName entries from retail transactions where buyerId is null
 * (i.e. consumer sales). These are potential unregistered taxpayers who may
 * be purchasing in bulk but aren't in the system.
 */
export async function getUnregisteredBuyers(): Promise<UnregisteredBuyer[]> {
    await requireRRASession("compliance_officer", "audit_officer");

    const results = await db
        .select({
            buyerName: transaction.buyerName,
            count: sql<number>`COUNT(*)::int`.as("count"),
            totalValue: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`.as("total_value"),
            lastSeen: sql<Date>`MAX(${transaction.createdAt})`.as("last_seen"),
        })
        .from(transaction)
        .where(
            sql`${transaction.buyerId} IS NULL AND ${transaction.buyerName} IS NOT NULL`,
        )
        .groupBy(transaction.buyerName)
        .orderBy(sql`COUNT(*) DESC`)
        .limit(50);

    // Enrich with seller names for context
    const enriched: UnregisteredBuyer[] = [];

    for (const row of results) {
        if (!row.buyerName) continue;

        const sellers = await db
            .select({ sellerName: user.businessName })
            .from(transaction)
            .innerJoin(user, eq(transaction.sellerId, user.id))
            .where(
                sql`${transaction.buyerName} = ${row.buyerName} AND ${transaction.buyerId} IS NULL`,
            )
            .groupBy(user.businessName)
            .limit(5);

        enriched.push({
            buyerName: row.buyerName,
            transactionCount: row.count,
            totalValue: row.totalValue,
            lastSeenAt: row.lastSeen,
            sellerNames: sellers
                .map((s) => s.sellerName)
                .filter((n): n is string => n !== null),
        });
    }

    // Sort by transaction count descending (most frequent = highest priority)
    return enriched.sort((a, b) => b.transactionCount - a.transactionCount);
}

// ---------------------------------------------------------------------------
// Registration timeliness — how quickly are new traders onboarding?
// ---------------------------------------------------------------------------

/**
 * For each trader, compare registration date to their first transaction date.
 * Large gaps suggest delayed registration. No transaction = never traded.
 */
export async function getRegistrationTimeliness(): Promise<RegistrationTimeliness[]> {
    await requireRRASession("compliance_officer", "audit_officer");

    const traders = await db
        .select({
            id: user.id,
            businessName: user.businessName,
            name: user.name,
            role: user.role,
            createdAt: user.createdAt,
        })
        .from(user)
        .where(
            sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
        )
        .orderBy(desc(user.createdAt));

    const results: RegistrationTimeliness[] = [];

    for (const trader of traders) {
        const [firstTxn] = await db
            .select({
                firstAt: sql<Date>`MIN(${transaction.createdAt})`.as("first_at"),
            })
            .from(transaction)
            .where(eq(transaction.sellerId, trader.id));

        const firstTransactionAt = firstTxn?.firstAt ?? null;
        const daysBetween =
            firstTransactionAt && trader.createdAt
                ? Math.round(
                      (new Date(firstTransactionAt).getTime() -
                          new Date(trader.createdAt).getTime()) /
                          (1000 * 60 * 60 * 24),
                  )
                : null;

        results.push({
            traderId: trader.id,
            traderName: trader.businessName ?? trader.name,
            role: trader.role ?? "unknown",
            registeredAt: trader.createdAt,
            firstTransactionAt,
            daysBetween,
        });
    }

    return results;
}
