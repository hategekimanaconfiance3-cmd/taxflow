"use server";

import { eq } from "drizzle-orm";
import db from "@/db/drizzle";
import { stock, stockMovement, product, user, auditLog } from "@/db/schema";
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

    // Quantity corrections, their ledger event, and their audit record commit together.
    await db.transaction(async (tx) => {
      const [locked] = await tx.select({ quantity: stock.quantity }).from(stock).where(eq(stock.id, stockId)).for("update").limit(1);
      if (!locked) throw new Error("Stock record not found.");
      const nextQuantity = typeof updates.quantity === "number" ? updates.quantity : locked.quantity;
      if (nextQuantity !== locked.quantity) {
        await tx.insert(stockMovement).values({ businessId: current.businessId, productId: current.productId,
          quantityDelta: nextQuantity - locked.quantity, quantityBefore: locked.quantity, quantityAfter: nextQuantity,
          movementType: "correction", sourceType: "stock_correction", sourceId: stockId,
          actorUserId: session.user.id, reason: reason.trim() });
      }
      await tx.update(stock).set(updates).where(eq(stock.id, stockId));
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
      }, async (entry) => { await tx.insert(auditLog).values(entry); });
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

    // Preserve a zero-balance stock row so historical references remain valid.
    await db.transaction(async (tx) => {
      const [locked] = await tx.select({ quantity: stock.quantity }).from(stock).where(eq(stock.id, stockId)).for("update").limit(1);
      if (!locked) throw new Error("Stock record not found.");
      if (locked.quantity !== 0) {
        await tx.insert(stockMovement).values({ businessId: current.businessId, productId: current.productId,
          quantityDelta: -locked.quantity, quantityBefore: locked.quantity, quantityAfter: 0,
          movementType: "correction_void", sourceType: "stock_correction", sourceId: stockId,
          actorUserId: session.user.id, reason: reason.trim() });
      }
      await tx.update(stock).set({ quantity: 0 }).where(eq(stock.id, stockId));
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
      }, async (entry) => { await tx.insert(auditLog).values(entry); });
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
