"use server";

import { and, desc, eq, gte, lt } from "drizzle-orm";
import db from "@/db/drizzle";
import { stock, product, user } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// Get stock inventory for a specific trader
// ---------------------------------------------------------------------------

export async function getTraderStock(traderId: string) {
    await requireRRASession("stock_officer", "audit_officer", "correction_officer", "product_traceability_officer", "audit_investigation_officer", "tax_audit_officer", "revenue_investigator");

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

export interface StockOverviewDateFilters {
    dateFrom?: string;
    dateTo?: string;
}

function parseDateFilter(value: string | undefined, label: string): Date | undefined {
    if (!value) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid ${label} date.`);
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        throw new Error(`Invalid ${label} date.`);
    }
    return date;
}

export async function getSystemStockOverview(filters: StockOverviewDateFilters = {}) {
    await requireRRASession("stock_officer", "audit_officer", "correction_officer", "product_traceability_officer", "audit_investigation_officer", "tax_audit_officer", "revenue_investigator");

    const dateFrom = parseDateFilter(filters.dateFrom, "start");
    const dateTo = parseDateFilter(filters.dateTo, "end");
    if (dateFrom && dateTo && dateFrom > dateTo) {
        throw new Error("The start date must be on or before the end date.");
    }

    // Use an exclusive next-day bound so the selected end date is inclusive
    // regardless of the database/session timezone.
    const dateToExclusive = dateTo ? new Date(dateTo) : undefined;
    dateToExclusive?.setUTCDate(dateToExclusive.getUTCDate() + 1);
    const dateCondition = dateFrom && dateToExclusive
        ? and(gte(stock.updatedAt, dateFrom), lt(stock.updatedAt, dateToExclusive))
        : dateFrom
            ? gte(stock.updatedAt, dateFrom)
            : dateToExclusive
                ? lt(stock.updatedAt, dateToExclusive)
                : undefined;

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
        .where(dateCondition)
        .orderBy(product.name, desc(stock.quantity));
}
