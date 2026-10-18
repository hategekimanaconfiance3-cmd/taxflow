"use server";

import { eq, sql, desc, and, or, gte, lte, ilike } from "drizzle-orm";
import db from "@/db/drizzle";
import { dispute, user, transaction, vatRecord, auditLog, stock, stockMovement, product, taxPayment } from "@/db/schema";
import {
    requireRRASession,
    type RRARole,
} from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";
import { getSystemConfig } from "@/lib/actions/system-config.action";

// ---------------------------------------------------------------------------
// Trader management
// ---------------------------------------------------------------------------

/**
 * Get all traders in the system (paginated).
 */
export async function getAllTraders() {
    await requireRRASession();

    return db
        .select({
            id: user.id,
            name: user.name,
            businessName: user.businessName,
            tinNumber: user.tinNumber,
            role: user.role,
            clearanceStatus: user.clearanceStatus,
            phoneNumber: user.phoneNumber,
            createdAt: user.createdAt,
        })
        .from(user)
        .where(
            sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
        )
        .orderBy(desc(user.createdAt));
}

/**
 * Get a single trader's profile.
 */
export async function getTrader(traderId: string) {
    await requireRRASession();

    const [trader] = await db
        .select()
        .from(user)
        .where(eq(user.id, traderId))
        .limit(1);

    if (!trader) {
        throw new Error("Trader not found");
    }

    return trader;
}

// ---------------------------------------------------------------------------
// Clearance management
// ---------------------------------------------------------------------------

type ClearanceStatus = "approved" | "under_review" | "suspended";

/**
 * Update a trader's clearance status.
 * Requires 'admin' level clearance for the RRA staff member.
 */
export async function updateClearanceStatus(
    targetUserId: string,
    newStatus: ClearanceStatus,
) {
    const { staff, ...session } = await requireRRASession("super_admin");

    const validStatuses: ClearanceStatus[] = [
        "approved",
        "under_review",
        "suspended",
    ];

    if (!validStatuses.includes(newStatus)) {
        throw new Error(`Invalid clearance status: ${newStatus}`);
    }

    // Get current status for audit
    const [target] = await db
        .select({ clearanceStatus: user.clearanceStatus, role: user.role })
        .from(user)
        .where(eq(user.id, targetUserId))
        .limit(1);

    if (!target) {
        throw new Error("User not found");
    }

    if (target.role === "rra_staff") {
        throw new Error("Cannot change clearance of RRA staff");
    }

    await db
        .update(user)
        .set({ clearanceStatus: newStatus })
        .where(eq(user.id, targetUserId));

    await logAudit({
        userId: session.user.id,
        action: "CLEARANCE_UPDATED",
        targetType: "user",
        targetId: targetUserId,
        metadata: {
            previousStatus: target.clearanceStatus,
            newStatus,
            updatedBy: staff.staffId,
        },
    });

    return { success: true };
}

// ---------------------------------------------------------------------------
// System-wide transactions (admin view)
// ---------------------------------------------------------------------------

export async function getAllTransactions(filters?: {
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
}) {
    await requireRRASession();

    const seller = db
        .select({ id: user.id, businessName: user.businessName })
        .from(user)
        .as("seller");

    const buyer = db
        .select({ id: user.id, businessName: user.businessName })
        .from(user)
        .as("buyer");

    // Build dynamic conditions
    const conditions = [];

    if (filters?.status && filters.status !== "all") {
        conditions.push(eq(transaction.status, filters.status));
    }

    if (filters?.dateFrom) {
        conditions.push(gte(transaction.createdAt, new Date(filters.dateFrom)));
    }

    if (filters?.dateTo) {
        const endDate = new Date(filters.dateTo);
        endDate.setHours(23, 59, 59, 999);
        conditions.push(lte(transaction.createdAt, endDate));
    }

    if (filters?.search) {
        const s = `%${filters.search}%`;
        conditions.push(
            or(
                ilike(sql`seller.business_name`, s),
                ilike(sql`COALESCE(buyer.business_name, ${transaction.buyerName})`, s),
                ilike(product.name, s),
            )!,
        );
    }

    let query = db
        .select({
            id: transaction.id,
            productName: product.name,
            sellerName: sql<string>`seller.business_name`,
            buyerName: sql<string>`COALESCE(buyer.business_name, ${transaction.buyerName})`,
            quantity: transaction.quantity,
            totalAmount: transaction.totalAmount,
            vatAmount: transaction.vatAmount,
            status: transaction.status,
            createdAt: transaction.createdAt,
            confirmedAt: transaction.confirmedAt,
        })
        .from(transaction)
        .innerJoin(product, eq(transaction.productId, product.id))
        .leftJoin(seller, eq(transaction.sellerId, sql`seller.id`))
        .leftJoin(buyer, eq(transaction.buyerId, sql`buyer.id`))
        .orderBy(desc(transaction.createdAt))
        .$dynamic();

    if (conditions.length > 0) {
        query = query.where(and(...conditions));
    }

    return query;
}

// ---------------------------------------------------------------------------
// Compliance report
// ---------------------------------------------------------------------------

export async function getComplianceReport() {
    await requireRRASession("compliance_officer");

    // Total traders by role
    const tradersByRole = await db
        .select({
            role: user.role,
            count: sql<number>`COUNT(*)`.as("count"),
        })
        .from(user)
        .where(
            sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
        )
        .groupBy(user.role);

    // Traders by clearance status
    const tradersByClearance = await db
        .select({
            clearanceStatus: user.clearanceStatus,
            count: sql<number>`COUNT(*)`.as("count"),
        })
        .from(user)
        .where(
            sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
        )
        .groupBy(user.clearanceStatus);

    // Transaction stats
    const transactionStats = await db
        .select({
            status: transaction.status,
            count: sql<number>`COUNT(*)`.as("count"),
            totalValue: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`.as(
                "total_value",
            ),
        })
        .from(transaction)
        .groupBy(transaction.status);

    // Total VAT
    const vatStats = await db
        .select({
            vatType: vatRecord.vatType,
            total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as("total"),
        })
        .from(vatRecord)
        .groupBy(vatRecord.vatType);

    return {
        tradersByRole,
        tradersByClearance,
        transactionStats,
        vatStats,
    };
}

// ---------------------------------------------------------------------------
// Audit log viewer
// ---------------------------------------------------------------------------

export async function getAuditLogs(filters?: {
    userId?: string;
    action?: string;
    limit?: number;
}) {
    await requireRRASession("super_admin");

    const limit = filters?.limit ?? 100;

    let query = db
        .select({
            id: auditLog.id,
            userName: user.name,
            businessName: user.businessName,
            action: auditLog.action,
            targetType: auditLog.targetType,
            targetId: auditLog.targetId,
            metadata: auditLog.metadata,
            createdAt: auditLog.createdAt,
        })
        .from(auditLog)
        .innerJoin(user, eq(auditLog.userId, user.id))
        .orderBy(desc(auditLog.createdAt))
        .limit(limit)
        .$dynamic();

    if (filters?.userId) {
        query = query.where(eq(auditLog.userId, filters.userId));
    }

    if (filters?.action) {
        query = query.where(eq(auditLog.action, filters.action));
    }

    return query;
}

// ---------------------------------------------------------------------------
// Modify Transaction (RRA only — §11.4)
// ---------------------------------------------------------------------------



/**
 * Modify a transaction's quantity and/or unit price.
 * Requires senior_officer clearance. Recalculates totals, VAT, and adjusts stock.
 */
export async function modifyTransaction(
    transactionId: string,
    changes: {
        quantity?: number;
        unitPrice?: number;
        reason: string; // mandatory
    },
) {
    const { staff, ...session } = await requireRRASession("compliance_officer");

    if (!changes.reason?.trim()) {
        throw new Error("A reason is required for all record modifications");
    }

    if (changes.quantity != null && changes.quantity <= 0) {
        throw new Error("Quantity must be positive");
    }

    if (changes.unitPrice != null && changes.unitPrice <= 0) {
        throw new Error("Unit price must be positive");
    }

    // Get the current transaction
    const [txn] = await db
        .select()
        .from(transaction)
        .where(eq(transaction.id, transactionId))
        .limit(1);

    if (!txn) {
        throw new Error("Transaction not found");
    }

    // Only confirmed/completed transactions can be modified
    if (txn.status !== "confirmed" && txn.status !== "completed") {
        throw new Error("Only confirmed or completed transactions can be modified");
    }

    // Calculate new values
    const newQuantity = changes.quantity ?? txn.quantity;
    const newUnitPrice = changes.unitPrice ?? txn.unitPrice;
    const config = await getSystemConfig();
    const newTotalAmount = newQuantity * newUnitPrice;
    const newVatAmount = Math.round(newTotalAmount * config.vatRate);

    const before = {
        quantity: txn.quantity,
        unitPrice: txn.unitPrice,
        totalAmount: txn.totalAmount,
        vatAmount: txn.vatAmount,
    };

    const after = {
        quantity: newQuantity,
        unitPrice: newUnitPrice,
        totalAmount: newTotalAmount,
        vatAmount: newVatAmount,
    };

    await db.transaction(async (tx) => {
        // 1. Update the transaction
        await tx
            .update(transaction)
            .set({
                quantity: newQuantity,
                unitPrice: newUnitPrice,
                totalAmount: newTotalAmount,
                vatAmount: newVatAmount,
            })
            .where(eq(transaction.id, transactionId));

        // 2. Update VAT records
        // Delete old VAT records for this transaction and recreate
        const oldVatRecords = await tx
            .select()
            .from(vatRecord)
            .where(eq(vatRecord.transactionId, transactionId));

        for (const vr of oldVatRecords) {
            await tx
                .update(vatRecord)
                .set({ amount: newVatAmount })
                .where(eq(vatRecord.id, vr.id));
        }

        // 3. Adjust stock if quantity changed
        if (changes.quantity != null && changes.quantity !== txn.quantity) {
            const qtyDiff = changes.quantity - txn.quantity;

            // Adjust seller stock (opposite direction — increase if qty decreased)
            const [sellerStock] = await tx
                .select()
                .from(stock)
                .where(
                    and(
                        eq(stock.businessId, txn.sellerId),
                        eq(stock.productId, txn.productId),
                    ),
                )
                .limit(1);

            if (sellerStock) {
                const after = sellerStock.quantity - qtyDiff;
                await tx
                    .update(stock)
                    .set({ quantity: after })
                    .where(eq(stock.id, sellerStock.id));
                await tx.insert(stockMovement).values({ businessId: txn.sellerId, productId: txn.productId, quantityDelta: -qtyDiff, quantityBefore: sellerStock.quantity, quantityAfter: after, movementType: "transaction_correction", sourceType: "transaction", sourceId: txn.id, actorUserId: session.user.id });
            }

            // Adjust buyer stock (same direction)
            if (txn.buyerId) {
                const [buyerStock] = await tx
                    .select()
                    .from(stock)
                    .where(
                        and(
                            eq(stock.businessId, txn.buyerId),
                            eq(stock.productId, txn.productId),
                        ),
                    )
                    .limit(1);

                if (buyerStock) {
                    const after = buyerStock.quantity + qtyDiff;
                    await tx
                        .update(stock)
                        .set({ quantity: after })
                        .where(eq(stock.id, buyerStock.id));
                    await tx.insert(stockMovement).values({ businessId: txn.buyerId, productId: txn.productId, quantityDelta: qtyDiff, quantityBefore: buyerStock.quantity, quantityAfter: after, movementType: "transaction_correction", sourceType: "transaction", sourceId: txn.id, actorUserId: session.user.id });
                }
            }
        }
    });

    await logAudit({
        userId: session.user.id,
        action: "TRANSACTION_MODIFIED",
        targetType: "transaction",
        targetId: transactionId,
        metadata: {
            reason: changes.reason.trim(),
            modifiedBy: staff.staffId,
            before,
            after,
        },
    });

    return { success: true, before, after };
}

// ---------------------------------------------------------------------------
// Get transactions for a specific trader (admin view)
// ---------------------------------------------------------------------------

export async function getTraderTransactions(traderId: string) {
    await requireRRASession();

    return db
        .select({
            id: transaction.id,
            productName: product.name,
            quantity: transaction.quantity,
            unitPrice: transaction.unitPrice,
            totalAmount: transaction.totalAmount,
            vatAmount: transaction.vatAmount,
            status: transaction.status,
            createdAt: transaction.createdAt,
            confirmedAt: transaction.confirmedAt,
            sellerId: transaction.sellerId,
            buyerId: transaction.buyerId,
            buyerName: transaction.buyerName,
        })
        .from(transaction)
        .innerJoin(product, eq(transaction.productId, product.id))
        .where(
            or(
                eq(transaction.sellerId, traderId),
                eq(transaction.buyerId, traderId),
            ),
        )
        .orderBy(desc(transaction.createdAt));
}

// ---------------------------------------------------------------------------
// Flag Transaction (mark as suspicious)
// ---------------------------------------------------------------------------

export async function flagTransaction(
    transactionId: string,
    reason: string,
) {
    const { staff, ...session } = await requireRRASession("compliance_officer");

    if (!reason?.trim()) {
        throw new Error("A reason is required to flag a transaction.");
    }

    const [txn] = await db
        .select({
            id: transaction.id,
            status: transaction.status,
        })
        .from(transaction)
        .where(eq(transaction.id, transactionId))
        .limit(1);

    if (!txn) throw new Error("Transaction not found.");

    if (txn.status === "rejected") {
        throw new Error("Cannot flag a rejected transaction.");
    }

    await logAudit({
        userId: session.user.id,
        action: "TRANSACTION_FLAGGED",
        targetType: "transaction",
        targetId: transactionId,
        metadata: {
            reason: reason.trim(),
            previousStatus: txn.status,
            flaggedBy: staff.staffId,
        },
    });

    return { success: true };
}

// ---------------------------------------------------------------------------
// Cancel Transaction (mark as rejected with reason)
// ---------------------------------------------------------------------------

export async function cancelTransaction(
    transactionId: string,
    reason: string,
) {
    const { staff, ...session } = await requireRRASession("super_admin");

    if (!reason?.trim()) {
        throw new Error("A reason is required to cancel a transaction.");
    }

    await db.transaction(async (tx) => {
        const [txn] = await tx
            .select()
            .from(transaction)
            .where(eq(transaction.id, transactionId))
            .for("update")
            .limit(1);

        if (!txn) throw new Error("Transaction not found.");
        if (txn.status === "rejected") throw new Error("Transaction is already rejected.");
        if (!["pending", "confirmed", "completed"].includes(txn.status)) {
            throw new Error("Transaction cannot be cancelled from its current status.");
        }

        const [activeDispute] = await tx
            .select({ id: dispute.id })
            .from(dispute)
            .where(and(
                eq(dispute.transactionId, txn.id),
                sql`${dispute.status} NOT IN ('resolved', 'dismissed')`,
            ))
            .limit(1);
        if (activeDispute) throw new Error("Resolve the active dispute before cancelling this transaction.");

        if (txn.status === "confirmed" || txn.status === "completed") {
            const [sellerStock] = await tx
                .select()
                .from(stock)
                .where(and(eq(stock.businessId, txn.sellerId), eq(stock.productId, txn.productId)))
                .for("update")
                .limit(1);

            if (sellerStock) {
                const after = sellerStock.quantity + txn.quantity;
                await tx.update(stock)
                    .set({ quantity: after })
                    .where(eq(stock.id, sellerStock.id));
                await tx.insert(stockMovement).values({ businessId: txn.sellerId, productId: txn.productId, quantityDelta: txn.quantity, quantityBefore: sellerStock.quantity, quantityAfter: after, movementType: "transaction_reversal", sourceType: "transaction", sourceId: txn.id, actorUserId: session.user.id });
            } else {
                await tx.insert(stock).values({
                    businessId: txn.sellerId,
                    productId: txn.productId,
                    quantity: txn.quantity,
                });
                await tx.insert(stockMovement).values({ businessId: txn.sellerId, productId: txn.productId, quantityDelta: txn.quantity, quantityBefore: 0, quantityAfter: txn.quantity, movementType: "transaction_reversal", sourceType: "transaction", sourceId: txn.id, actorUserId: session.user.id });
            }

            if (txn.buyerId) {
                const [buyerStock] = await tx
                    .select()
                    .from(stock)
                    .where(and(eq(stock.businessId, txn.buyerId), eq(stock.productId, txn.productId)))
                    .for("update")
                    .limit(1);

                if (!buyerStock || buyerStock.quantity < txn.quantity) {
                    throw new Error("Transaction cannot be reversed because the buyer no longer has the purchased stock.");
                }

                const after = buyerStock.quantity - txn.quantity;
                await tx.update(stock)
                    .set({ quantity: after })
                    .where(eq(stock.id, buyerStock.id));
                await tx.insert(stockMovement).values({ businessId: txn.buyerId!, productId: txn.productId, quantityDelta: -txn.quantity, quantityBefore: buyerStock.quantity, quantityAfter: after, movementType: "transaction_reversal", sourceType: "transaction", sourceId: txn.id, actorUserId: session.user.id });
            }

            const originalVatRecords = await tx
                .select()
                .from(vatRecord)
                .where(eq(vatRecord.transactionId, txn.id));

            if (originalVatRecords.length === 0) {
                throw new Error("Transaction VAT records are missing; cancellation requires manual review.");
            }

            await tx.insert(vatRecord).values(originalVatRecords.map((record) => ({
                transactionId: txn.id,
                businessId: record.businessId,
                vatType: record.vatType,
                amount: -record.amount,
                period: record.period,
            })));
        }

        const [updated] = await tx.update(transaction)
            .set({ status: "rejected", rejectedAt: new Date() })
            .where(and(eq(transaction.id, txn.id), eq(transaction.status, txn.status)))
            .returning({ id: transaction.id });

        if (!updated) throw new Error("Transaction status changed; cancellation was not applied.");

        await tx.insert(auditLog).values({
            userId: session.user.id,
            action: "TRANSACTION_CANCELLED",
            targetType: "transaction",
            targetId: transactionId,
            metadata: JSON.stringify({
                reason: reason.trim(),
                previousStatus: txn.status,
                cancelledBy: staff.staffId,
                quantity: txn.quantity,
                vatAmountReversed: txn.status === "confirmed" || txn.status === "completed" ? txn.vatAmount : 0,
            }),
        });
    });

    return { success: true };
}
