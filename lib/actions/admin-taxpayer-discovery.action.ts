"use server";

import { sql, eq, desc, not, inArray } from "drizzle-orm";
import db from "@/db/drizzle";
import tinDb from "@/db/tin-drizzle";
import { user, transaction } from "@/db/schema";
import { tinRecord } from "@/db/tin-schema";
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
    /** True if this name appears in supply-chain (B2B) transactions, not just retail */
    isB2B: boolean;
};

export type GhostTaxpayer = {
    tinNumber: string;
    businessName: string;
    businessType: string | null;
    district: string | null;
    phone: string;
    /** Whether this TIN is in the TaxFlow user DB at all */
    isRegistered: false;
};

export type PendingApproval = {
    userId: string;
    name: string;
    businessName: string | null;
    tinNumber: string | null;
    role: string;
    email: string;
    registeredAt: Date;
    /** Days since signup without approval */
    daysPending: number;
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
// 1. Unregistered buyers — consumer + supply-chain transactions
// ---------------------------------------------------------------------------

/**
 * Find unique buyerName entries from transactions where buyerId is null.
 * Now covers both retail (consumer) and any B2B transaction where the buyer
 * name was entered manually instead of being linked to a registered user.
 *
 * These are potential unregistered taxpayers who may be purchasing in bulk
 * without being in the system.
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
            sql`${transaction.buyerId} IS NULL AND ${transaction.buyerName} IS NOT NULL AND TRIM(${transaction.buyerName}) != ''`,
        )
        .groupBy(transaction.buyerName)
        .orderBy(sql`SUM(${transaction.totalAmount}) DESC`)
        .limit(100);

    // Get all registered business names for cross-referencing
    const registeredNames = await db
        .select({ businessName: user.businessName })
        .from(user)
        .where(sql`${user.businessName} IS NOT NULL`);

    const registeredSet = new Set(
        registeredNames
            .map((r) => r.businessName?.toLowerCase().trim())
            .filter(Boolean),
    );

    // Enrich with seller names and B2B flag
    const enriched: UnregisteredBuyer[] = [];

    for (const row of results) {
        if (!row.buyerName) continue;

        // Skip names that match a registered business (fuzzy: lowercase/trim)
        const normalised = row.buyerName.toLowerCase().trim();
        if (registeredSet.has(normalised)) continue;

        const sellers = await db
            .select({ sellerName: user.businessName, sellerRole: user.role })
            .from(transaction)
            .innerJoin(user, eq(transaction.sellerId, user.id))
            .where(
                sql`${transaction.buyerName} = ${row.buyerName} AND ${transaction.buyerId} IS NULL`,
            )
            .groupBy(user.businessName, user.role)
            .limit(5);

        // If any seller is a manufacturer or wholesaler this is a B2B ghost buyer
        const isB2B = sellers.some((s) =>
            s.sellerRole === "manufacturer" || s.sellerRole === "wholesaler",
        );

        enriched.push({
            buyerName: row.buyerName,
            transactionCount: row.count,
            totalValue: row.totalValue,
            lastSeenAt: row.lastSeen,
            sellerNames: sellers
                .map((s) => s.sellerName)
                .filter((n): n is string => n !== null),
            isB2B,
        });
    }

    // Sort: B2B ghosts first (higher tax risk), then by total value
    return enriched.sort((a, b) => {
        if (a.isB2B !== b.isB2B) return a.isB2B ? -1 : 1;
        return b.totalValue - a.totalValue;
    });
}

// ---------------------------------------------------------------------------
// 2. Ghost taxpayers — TIN registry entries not in TaxFlow user table
// ---------------------------------------------------------------------------

/**
 * Cross-reference the TIN registry against registered TaxFlow users.
 * Returns TIN records that exist in the government database but have never
 * signed up on TaxFlow — these are unregistered businesses that owe tax.
 */
export async function getGhostTaxpayers(limit = 50): Promise<GhostTaxpayer[]> {
    await requireRRASession("compliance_officer", "audit_officer");

    // Get all TIN numbers that ARE registered in TaxFlow
    const registeredTins = await db
        .select({ tin: user.tinNumber })
        .from(user)
        .where(sql`${user.tinNumber} IS NOT NULL`);

    const registeredTinSet = registeredTins
        .map((r) => r.tin)
        .filter((t): t is string => t !== null);

    // Query TIN DB for active records NOT in the registered set
    const ghostQuery = tinDb
        .select({
            tinNumber: tinRecord.tinNumber,
            businessName: tinRecord.businessName,
            businessType: tinRecord.businessType,
            district: tinRecord.district,
            phone: tinRecord.phone,
        })
        .from(tinRecord)
        .where(sql`${tinRecord.isActive} = true`)
        .limit(limit);

    const allTins = await ghostQuery;

    // Filter out already-registered ones in JS (avoids cross-DB SQL)
    const ghosts = allTins.filter(
        (t) => !registeredTinSet.includes(t.tinNumber),
    );

    return ghosts.map((t) => ({
        tinNumber: t.tinNumber,
        businessName: t.businessName,
        businessType: t.businessType,
        district: t.district,
        phone: t.phone,
        isRegistered: false as const,
    }));
}

// ---------------------------------------------------------------------------
// 3. Pending approval queue — new signups awaiting RRA clearance
// ---------------------------------------------------------------------------

/**
 * Return traders who signed up but have clearanceStatus = 'pending'.
 * These need RRA staff to review and approve (or reject) before they can trade.
 * Sorted by days pending descending — longest-waiting first.
 */
export async function getPendingApprovals(): Promise<PendingApproval[]> {
    await requireRRASession("compliance_officer", "audit_officer");

    const pending = await db
        .select({
            id: user.id,
            name: user.name,
            businessName: user.businessName,
            tinNumber: user.tinNumber,
            role: user.role,
            email: user.email,
            createdAt: user.createdAt,
        })
        .from(user)
        .where(
            sql`${user.clearanceStatus} = 'pending' AND ${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
        )
        .orderBy(user.createdAt); // Oldest first

    const now = Date.now();
    return pending.map((t) => ({
        userId: t.id,
        name: t.name,
        businessName: t.businessName,
        tinNumber: t.tinNumber,
        role: t.role,
        email: t.email,
        registeredAt: t.createdAt,
        daysPending: Math.floor(
            (now - new Date(t.createdAt).getTime()) / (1000 * 60 * 60 * 24),
        ),
    }));
}

// ---------------------------------------------------------------------------
// 4. Registration timeliness — how quickly are new traders onboarding?
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
