"use server";

import { eq, desc } from "drizzle-orm";
import db from "@/db/drizzle";
import { stock, product, user } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// Get stock inventory for a specific trader
// ---------------------------------------------------------------------------

export async function getTraderStock(traderId: string) {
    await requireRRASession("stock_officer", "audit_officer", "correction_officer", "product_traceability_officer", "audit_investigation_officer");

    const inventory = await db
        .select({
            id: stock.id,
            quantity: stock.quantity,
            price: stock.price,
            source: stock.source,
            updatedAt: stock.updatedAt,
            productName: product.name,
            productUnit: product.unit,
            productId: stock.productId,
        })
        .from(stock)
        .innerJoin(product, eq(stock.productId, product.id))
        .where(eq(stock.businessId, traderId))
        .orderBy(desc(stock.updatedAt));

    return inventory;
}

// ---------------------------------------------------------------------------
// Get system-wide stock overview (all businesses, all products)
// ---------------------------------------------------------------------------

export async function getSystemStockOverview(tin?: string) {
    await requireRRASession("stock_officer", "audit_officer", "correction_officer", "product_traceability_officer", "audit_investigation_officer");
    if (tin && (tin.trim().length < 5 || tin.trim().length > 32 || !/^[A-Za-z0-9-]+$/.test(tin.trim()))) {
        throw new Error("Enter a valid TIN to filter stock records.");
    }

    return db
        .select({
            id: stock.id,
            quantity: stock.quantity,
            price: stock.price,
            source: stock.source,
            updatedAt: stock.updatedAt,
            productName: product.name,
            productUnit: product.unit,
            productId: stock.productId,
            businessId: stock.businessId,
            businessName: user.businessName,
            ownerName: user.name,
            role: user.role,
        })
        .from(stock)
        .innerJoin(product, eq(stock.productId, product.id))
        .innerJoin(user, eq(stock.businessId, user.id))
        .where(tin ? eq(user.tinNumber, tin.trim()) : undefined)
        .orderBy(product.name, desc(stock.quantity));
}
