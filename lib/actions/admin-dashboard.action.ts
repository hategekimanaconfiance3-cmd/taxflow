"use server";

import { eq, desc, sql, and, or, ilike, gte, lte } from "drizzle-orm";
import db from "@/db/drizzle";
import {
    user,
    transaction,
    vatRecord,
    auditLog,
    importDeclaration,
    dispute,
    taxPayment,
    product,
} from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// Dashboard overview — single aggregated call
// ---------------------------------------------------------------------------

export async function getDashboardOverview(from?: Date, to?: Date) {
    await requireRRASession("compliance_officer", "audit_officer", "reporting_officer", "director_executive", "tax_compliance_officer", "audit_investigation_officer", "data_ai_analyst");

    // Build date filter conditions for each table
    const txnDateFilter = from && to ? and(gte(transaction.createdAt, from), lte(transaction.createdAt, to)) : from ? gte(transaction.createdAt, from) : to ? lte(transaction.createdAt, to) : undefined;
    const vatDateFilter = from && to ? and(gte(vatRecord.createdAt, from), lte(vatRecord.createdAt, to)) : from ? gte(vatRecord.createdAt, from) : to ? lte(vatRecord.createdAt, to) : undefined;
    const payDateFilter = from && to ? and(gte(taxPayment.createdAt, from), lte(taxPayment.createdAt, to)) : from ? gte(taxPayment.createdAt, from) : to ? lte(taxPayment.createdAt, to) : undefined;
    const importDateFilter = from && to ? and(gte(importDeclaration.createdAt, from), lte(importDeclaration.createdAt, to)) : from ? gte(importDeclaration.createdAt, from) : to ? lte(importDeclaration.createdAt, to) : undefined;
    const disputeDateFilter = from && to ? and(gte(dispute.createdAt, from), lte(dispute.createdAt, to)) : from ? gte(dispute.createdAt, from) : to ? lte(dispute.createdAt, to) : undefined;
    const auditDateFilter = from && to ? and(gte(auditLog.createdAt, from), lte(auditLog.createdAt, to)) : from ? gte(auditLog.createdAt, from) : to ? lte(auditLog.createdAt, to) : undefined;

    // Run all queries in parallel for speed
    const [
        tradersByRole,
        tradersByClearance,
        totalTraders,
        transactionStats,
        transactionsToday,
        transactionsThisWeek,
        vatStats,
        taxPaymentStats,
        importStats,
        disputeStats,
        recentTransactions,
        recentImports,
        recentDisputes,
        recentAudit,
        newTradersThisWeek,
    ] = await Promise.all([
        // 1. Traders by role
        db
            .select({
                role: user.role,
                count: sql<number>`COUNT(*)`.as("count"),
            })
            .from(user)
            .where(
                sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
            )
            .groupBy(user.role),

        // 2. Traders by clearance
        db
            .select({
                clearanceStatus: user.clearanceStatus,
                count: sql<number>`COUNT(*)`.as("count"),
            })
            .from(user)
            .where(
                sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
            )
            .groupBy(user.clearanceStatus),

        // 3. Total trader count
        db
            .select({ count: sql<number>`COUNT(*)`.as("count") })
            .from(user)
            .where(
                sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
            ),

        // 4. Transaction stats by status
        db
            .select({
                status: transaction.status,
                count: sql<number>`COUNT(*)::int`.as("count"),
                totalValue: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`.as(
                    "total_value",
                ),
                totalVat: sql<number>`COALESCE(SUM(${transaction.vatAmount}), 0)::float8`.as(
                    "total_vat",
                ),
            })
            .from(transaction)
            .where(txnDateFilter)
            .groupBy(transaction.status),

        // 5. Transactions created today
        db
            .select({
                count: sql<number>`COUNT(*)`.as("count"),
                totalValue: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`.as(
                    "total_value",
                ),
            })
            .from(transaction)
            .where(sql`${transaction.createdAt} >= CURRENT_DATE`),

        // 6. Transactions this week
        db
            .select({
                count: sql<number>`COUNT(*)`.as("count"),
                totalValue: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`.as(
                    "total_value",
                ),
            })
            .from(transaction)
            .where(
                sql`${transaction.createdAt} >= CURRENT_DATE - INTERVAL '7 days'`,
            ),

        // 7. VAT stats
        db
            .select({
                vatType: vatRecord.vatType,
                total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as(
                    "total",
                ),
            })
            .from(vatRecord)
            .where(vatDateFilter)
            .groupBy(vatRecord.vatType),

        // 8. Tax payment totals
        db
            .select({
                total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as(
                    "total",
                ),
                count: sql<number>`COUNT(*)`.as("count"),
            })
            .from(taxPayment)
            .where(payDateFilter ? and(eq(taxPayment.status, "confirmed"), payDateFilter) : eq(taxPayment.status, "confirmed")),

        // 9. Import stats by status
        db
            .select({
                status: importDeclaration.status,
                count: sql<number>`COUNT(*)`.as("count"),
            })
            .from(importDeclaration)
            .where(importDateFilter)
            .groupBy(importDeclaration.status),

        // 10. Dispute stats by status
        db
            .select({
                status: dispute.status,
                count: sql<number>`COUNT(*)`.as("count"),
            })
            .from(dispute)
            .where(disputeDateFilter)
            .groupBy(dispute.status),

        // 11. Recent transactions (5)
        db
            .select({
                id: transaction.id,
                sellerName: user.businessName,
                productName: product.name,
                totalAmount: transaction.totalAmount,
                vatAmount: transaction.vatAmount,
                status: transaction.status,
                createdAt: transaction.createdAt,
            })
            .from(transaction)
            .innerJoin(user, eq(transaction.sellerId, user.id))
            .innerJoin(product, eq(transaction.productId, product.id))
            .orderBy(desc(transaction.createdAt))
            .limit(5),

        // 12. Recent imports (5)
        db
            .select({
                id: importDeclaration.id,
                businessName: user.businessName,
                productName: product.name,
                expectedQuantity: importDeclaration.expectedQuantity,
                actualQuantity: importDeclaration.actualQuantity,
                status: importDeclaration.status,
                createdAt: importDeclaration.createdAt,
            })
            .from(importDeclaration)
            .innerJoin(user, eq(importDeclaration.businessId, user.id))
            .innerJoin(product, eq(importDeclaration.productId, product.id))
            .orderBy(desc(importDeclaration.createdAt))
            .limit(5),

        // 13. Recent disputes (5)
        db
            .select({
                id: dispute.id,
                referenceNumber: dispute.referenceNumber,
                reason: dispute.reason,
                status: dispute.status,
                counterpartyResponse: dispute.counterpartyResponse,
                createdAt: dispute.createdAt,
                filedByName: user.businessName,
            })
            .from(dispute)
            .innerJoin(user, eq(dispute.filedById, user.id))
            .orderBy(desc(dispute.createdAt))
            .limit(5),

        // 14. Recent audit logs (5)
        db
            .select({
                id: auditLog.id,
                action: auditLog.action,
                targetType: auditLog.targetType,
                targetId: auditLog.targetId,
                createdAt: auditLog.createdAt,
                userName: user.businessName,
            })
            .from(auditLog)
            .innerJoin(user, eq(auditLog.userId, user.id))
            .orderBy(desc(auditLog.createdAt))
            .limit(5),

        // 15. New traders this week
        db
            .select({ count: sql<number>`COUNT(*)`.as("count") })
            .from(user)
            .where(
                and(
                    sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
                    sql`${user.createdAt} >= CURRENT_DATE - INTERVAL '7 days'`,
                ),
            ),
    ]);

    // Parse aggregate results
    const vatOutput =
        Number(vatStats.find((r) => r.vatType === "output")?.total ?? 0) || 0;
    const vatInput =
        Number(vatStats.find((r) => r.vatType === "input")?.total ?? 0) || 0;

    const confirmedTxns =
        transactionStats.find((s) => s.status === "confirmed") ?? {
            count: 0,
            totalValue: 0,
            totalVat: 0,
        };
    const completedTxns =
        transactionStats.find((s) => s.status === "completed") ?? {
            count: 0,
            totalValue: 0,
            totalVat: 0,
        };
    const pendingTxns =
        transactionStats.find((s) => s.status === "pending") ?? {
            count: 0,
            totalValue: 0,
            totalVat: 0,
        };

    const totalTxnCount = transactionStats.reduce(
        (sum, s) => sum + (Number(s.count) || 0),
        0,
    );
    const totalTxnValue = transactionStats.reduce(
        (sum, s) => sum + (Number(s.totalValue) || 0),
        0,
    );

    const submittedImports =
        importStats.find((s) => s.status === "submitted")?.count ?? 0;
    const activatedImports =
        importStats.find((s) => s.status === "activated")?.count ?? 0;
    const totalImports = importStats.reduce((sum, s) => sum + s.count, 0);

    const underReviewDisputes =
        disputeStats.find((s) => s.status === "under_review")?.count ?? 0;
    const filedDisputes =
        disputeStats.find((s) => s.status === "filed")?.count ?? 0;
    const totalDisputes = disputeStats.reduce((sum, s) => sum + s.count, 0);

    const clearanceMap = Object.fromEntries(
        tradersByClearance.map((c) => [c.clearanceStatus, c.count]),
    ) as Record<string, number>;

    const roleMap = Object.fromEntries(
        tradersByRole.map((r) => [r.role, r.count]),
    ) as Record<string, number>;

    // ── Period comparison (last 30 days vs prior 30 days) ─────────
    // Only computed when a date filter is active; "All Time" has no
    // meaningful period-over-period comparison so we skip the queries.
    const hasDates = !!(from || to);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const [
        txnCurrent,
        txnPrior,
        vatCurrent,
        vatPrior,
        payCurrent,
        payPrior,
    ] = hasDates
        ? await Promise.all([
            db.select({ count: sql<number>`COUNT(*)::int`.as("c"), total: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`.as("t") })
                .from(transaction).where(gte(transaction.createdAt, thirtyDaysAgo)),
            db.select({ count: sql<number>`COUNT(*)::int`.as("c"), total: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`.as("t") })
                .from(transaction).where(and(gte(transaction.createdAt, sixtyDaysAgo), lte(transaction.createdAt, thirtyDaysAgo))),
            db.select({ total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as("t") })
                .from(vatRecord).where(and(eq(vatRecord.vatType, "output"), gte(vatRecord.createdAt, thirtyDaysAgo))),
            db.select({ total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as("t") })
                .from(vatRecord).where(and(eq(vatRecord.vatType, "output"), gte(vatRecord.createdAt, sixtyDaysAgo), lte(vatRecord.createdAt, thirtyDaysAgo))),
            db.select({ total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as("t") })
                .from(taxPayment).where(and(eq(taxPayment.status, "confirmed"), gte(taxPayment.createdAt, thirtyDaysAgo))),
            db.select({ total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as("t") })
                .from(taxPayment).where(and(eq(taxPayment.status, "confirmed"), gte(taxPayment.createdAt, sixtyDaysAgo), lte(taxPayment.createdAt, thirtyDaysAgo))),
          ])
        : [null, null, null, null, null, null];

    function pctChange(current: number, previous: number): { value: string; positive: boolean } | undefined {
        if (previous === 0 && current === 0) return undefined;
        if (previous === 0) return { value: "New activity", positive: true };
        const pct = Math.round(((current - previous) / previous) * 100);
        return { value: `${pct >= 0 ? "+" : ""}${pct}% vs prior 30d`, positive: pct >= 0 };
    }

    return {
        // Trader stats
        traders: {
            total: totalTraders[0]?.count ?? 0,
            byRole: roleMap,
            byClearance: clearanceMap,
            newThisWeek: newTradersThisWeek[0]?.count ?? 0,
            suspended: clearanceMap["suspended"] ?? 0,
            flagged: clearanceMap["flagged"] ?? 0,
        },

        // Revenue
        revenue: {
            vatOutput,
            vatInput,
            netVatDue: vatOutput - vatInput,
            taxPaymentsTotal: Number(taxPaymentStats[0]?.total ?? 0) || 0,
            taxPaymentsCount: taxPaymentStats[0]?.count ?? 0,
            outstanding: (vatOutput - vatInput) - (Number(taxPaymentStats[0]?.total ?? 0) || 0),
        },

        // Transactions
        transactions: {
            total: totalTxnCount,
            totalValue: totalTxnValue,
            confirmed: confirmedTxns.count,
            completed: completedTxns.count,
            pending: pendingTxns.count,
            today: {
                count: transactionsToday[0]?.count ?? 0,
                value: Number(transactionsToday[0]?.totalValue ?? 0) || 0,
            },
            thisWeek: {
                count: transactionsThisWeek[0]?.count ?? 0,
                value: Number(transactionsThisWeek[0]?.totalValue ?? 0) || 0,
            },
        },

        // Imports
        imports: {
            total: totalImports,
            submitted: submittedImports,
            activated: activatedImports,
        },

        // Disputes
        disputes: {
            total: totalDisputes,
            underReview: underReviewDisputes,
            filed: filedDisputes,
        },

        // Recent activity
        recent: {
            transactions: recentTransactions,
            imports: recentImports,
            disputes: recentDisputes,
            audit: recentAudit,
        },

        // Trends (last 30d vs prior 30d — undefined when All Time)
        trends: {
            vatGenerated: hasDates ? pctChange(Number(vatCurrent?.[0]?.total ?? 0) || 0, Number(vatPrior?.[0]?.total ?? 0) || 0) : undefined,
            vatCollected: hasDates ? pctChange(Number(payCurrent?.[0]?.total ?? 0) || 0, Number(payPrior?.[0]?.total ?? 0) || 0) : undefined,
            transactions: hasDates ? pctChange(txnCurrent?.[0]?.count ?? 0, txnPrior?.[0]?.count ?? 0) : undefined,
            transactionValue: hasDates ? pctChange(Number(txnCurrent?.[0]?.total ?? 0) || 0, Number(txnPrior?.[0]?.total ?? 0) || 0) : undefined,
        },
    };
}

// ---------------------------------------------------------------------------
// Global search — search across traders, transactions, imports
// ---------------------------------------------------------------------------

export async function adminGlobalSearch(query: string) {
    await requireRRASession("compliance_officer", "audit_officer", "tax_compliance_officer", "audit_investigation_officer");

    if (!query?.trim() || query.trim().length < 2) {
        return { traders: [], transactions: [], imports: [], disputes: [] };
    }

    const q = `%${query.trim()}%`;

    const [traders, transactions_, imports, disputes_] = await Promise.all([
        // Search traders by name, TIN, email
        db
            .select({
                id: user.id,
                businessName: user.businessName,
                tinNumber: user.tinNumber,
                role: user.role,
                clearanceStatus: user.clearanceStatus,
            })
            .from(user)
            .where(
                and(
                    sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
                    or(
                        ilike(user.businessName, q),
                        ilike(user.tinNumber, q),
                        ilike(user.email, q),
                        ilike(user.name, q),
                    ),
                ),
            )
            .limit(5),

        // Search transactions by ID or product name
        db
            .select({
                id: transaction.id,
                sellerName: user.businessName,
                productName: product.name,
                totalAmount: transaction.totalAmount,
                status: transaction.status,
                createdAt: transaction.createdAt,
            })
            .from(transaction)
            .innerJoin(user, eq(transaction.sellerId, user.id))
            .innerJoin(product, eq(transaction.productId, product.id))
            .where(
                or(
                    ilike(transaction.id, q),
                    ilike(product.name, q),
                    ilike(user.businessName, q),
                ),
            )
            .orderBy(desc(transaction.createdAt))
            .limit(5),

        // Search imports by customs ref, origin country, or business name
        db
            .select({
                id: importDeclaration.id,
                businessName: user.businessName,
                productName: product.name,
                customsRef: importDeclaration.customsRef,
                status: importDeclaration.status,
                createdAt: importDeclaration.createdAt,
            })
            .from(importDeclaration)
            .innerJoin(user, eq(importDeclaration.businessId, user.id))
            .innerJoin(
                product,
                eq(importDeclaration.productId, product.id),
            )
            .where(
                or(
                    ilike(importDeclaration.customsRef, q),
                    ilike(importDeclaration.originCountry, q),
                    ilike(product.name, q),
                    ilike(user.businessName, q),
                ),
            )
            .orderBy(desc(importDeclaration.createdAt))
            .limit(5),

        // Search disputes by reference number or reason
        db
            .select({
                id: dispute.id,
                referenceNumber: dispute.referenceNumber,
                reason: dispute.reason,
                status: dispute.status,
                filedByName: user.businessName,
                createdAt: dispute.createdAt,
            })
            .from(dispute)
            .innerJoin(user, eq(dispute.filedById, user.id))
            .where(
                or(
                    ilike(dispute.referenceNumber, q),
                    ilike(dispute.reason, q),
                    ilike(user.businessName, q),
                ),
            )
            .orderBy(desc(dispute.createdAt))
            .limit(5),
    ]);

    return {
        traders,
        transactions: transactions_,
        imports,
        disputes: disputes_,
    };
}
