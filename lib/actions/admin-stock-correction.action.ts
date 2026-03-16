"use server";

import { eq } from "drizzle-orm";
import db from "@/db/drizzle";
import { stock, product, user, auditLog } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";
import { desc } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Edit a stock record (correction officer + super admin only)
// ---------------------------------------------------------------------------

export async function editStockRecord(
    stockId: string,
    data: {
        quantity?: number;
        price?: number | null;
        source?: string | null;
    },
    reason: string,
) {
    const { staff, ...session } = await requireRRASession(
        "correction_officer",
        "super_admin",
    );

    if (!reason || reason.trim().length < 5) {
        throw new Error("A reason for correction is required (min 5 characters).");
    }

    // 1. Get current record with trader info
    const [current] = await db
        .select({
            id: stock.id,
            quantity: stock.quantity,
            price: stock.price,
            source: stock.source,
            businessId: stock.businessId,
            productId: stock.productId,
            productName: product.name,
            traderTin: user.tinNumber,
            traderName: user.businessName,
        })
        .from(stock)
        .innerJoin(product, eq(stock.productId, product.id))
        .innerJoin(user, eq(stock.businessId, user.id))
        .where(eq(stock.id, stockId))
        .limit(1);

    if (!current) throw new Error("Stock record not found.");

    // 2. Build update object (only changed fields)
    const updates: Record<string, unknown> = {};
    if (data.quantity !== undefined && data.quantity !== current.quantity)
        updates.quantity = data.quantity;
    if (data.price !== undefined && data.price !== current.price)
        updates.price = data.price;
    if (data.source !== undefined && data.source !== current.source)
        updates.source = data.source;

    if (Object.keys(updates).length === 0) {
        throw new Error("No changes detected.");
    }

    // 3. Apply update
    await db.update(stock).set(updates).where(eq(stock.id, stockId));

    // 4. Audit log with before/after values
    await logAudit({
        userId: session.user.id,
        action: "STOCK_EDITED",
        targetType: "stock",
        targetId: stockId,
        metadata: {
            officerId: staff.staffId,
            traderTin: current.traderTin,
            traderName: current.traderName,
            productName: current.productName,
            reason: reason.trim(),
            before: {
                quantity: current.quantity,
                price: current.price,
                source: current.source,
            },
            after: {
                ...{ quantity: current.quantity, price: current.price, source: current.source },
                ...updates,
            },
        },
    });

    return { success: true };
}

// ---------------------------------------------------------------------------
// Delete a stock record (correction officer + super admin only)
// ---------------------------------------------------------------------------

export async function deleteStockRecord(stockId: string, reason: string) {
    const { staff, ...session } = await requireRRASession(
        "correction_officer",
        "super_admin",
    );

    if (!reason || reason.trim().length < 5) {
        throw new Error("A reason for deletion is required (min 5 characters).");
    }

    // 1. Get current record snapshot
    const [current] = await db
        .select({
            id: stock.id,
            quantity: stock.quantity,
            price: stock.price,
            source: stock.source,
            businessId: stock.businessId,
            productId: stock.productId,
            productName: product.name,
            traderTin: user.tinNumber,
            traderName: user.businessName,
        })
        .from(stock)
        .innerJoin(product, eq(stock.productId, product.id))
        .innerJoin(user, eq(stock.businessId, user.id))
        .where(eq(stock.id, stockId))
        .limit(1);

    if (!current) throw new Error("Stock record not found.");

    // 2. Delete the record
    await db.delete(stock).where(eq(stock.id, stockId));

    // 3. Audit log with full snapshot of deleted record
    await logAudit({
        userId: session.user.id,
        action: "STOCK_DELETED",
        targetType: "stock",
        targetId: stockId,
        metadata: {
            officerId: staff.staffId,
            traderTin: current.traderTin,
            traderName: current.traderName,
            productName: current.productName,
            reason: reason.trim(),
            deletedRecord: {
                quantity: current.quantity,
                price: current.price,
                source: current.source,
                productId: current.productId,
                businessId: current.businessId,
            },
        },
    });

    return { success: true };
}

// ---------------------------------------------------------------------------
// Get correction / audit history for a specific stock record
// ---------------------------------------------------------------------------

export async function getStockCorrectionHistory(stockId: string) {
    await requireRRASession(
        "correction_officer",
        "audit_officer",
        "super_admin",
    );

    const entries = await db
        .select({
            id: auditLog.id,
            action: auditLog.action,
            userId: auditLog.userId,
            metadata: auditLog.metadata,
            createdAt: auditLog.createdAt,
            officerName: user.name,
        })
        .from(auditLog)
        .leftJoin(user, eq(auditLog.userId, user.id))
        .where(eq(auditLog.targetId, stockId))
        .orderBy(desc(auditLog.createdAt));

    return entries.map((e) => ({
        ...e,
        metadata: e.metadata ? JSON.parse(e.metadata as string) : null,
    }));
}
