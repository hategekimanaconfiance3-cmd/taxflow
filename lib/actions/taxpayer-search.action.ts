"use server";

import { and, asc, count, gte, ilike, lte, or, sql } from "drizzle-orm";
import db from "@/db/drizzle";
import { user } from "@/db/schema";
import { requireRRAPermission } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";
import {
    type TaxpayerSearchFilters,
    validateSearchFilters,
} from "@/lib/taxpayer-search-filters";

// Re-export types and validation for client-side use
export { type TaxpayerSearchFilters, validateSearchFilters } from "@/lib/taxpayer-search-filters";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface TaxpayerSearchRow {
    id: string;
    name: string;
    businessName: string | null;
    tinNumber: string | null;
    role: string | null;
    businessType: string | null;
    clearanceStatus: string | null;
    email: string;
    phoneNumber: string | null;
    createdAt: Date;
}

export interface TaxpayerSearchResult {
    rows: TaxpayerSearchRow[];
    totalRows: number;
    totalPages: number;
    page: number;
    pageSize: number;
}

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// buildFilterConditions — Drizzle WHERE conditions from validated filters
// ---------------------------------------------------------------------------

function buildFilterConditions(filters: TaxpayerSearchFilters) {
    const conditions = [
        // Always restrict to trader roles only
        sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
    ];

    // Text search across TIN, business name, name, email
    if (filters.query && filters.query.trim().length >= 2) {
        const q = `%${filters.query.trim()}%`;
        conditions.push(
            or(
                ilike(user.tinNumber, q),
                ilike(user.businessName, q),
                ilike(user.name, q),
                ilike(user.email, q),
            )!,
        );
    }

    // Business role filter
    if (filters.role) {
        conditions.push(sql`${user.role} = ${filters.role}`);
    }

    // Business type filter (registered_business | institution | government | large_bulk_buyer)
    if (filters.businessType) {
        conditions.push(sql`${user.businessType} = ${filters.businessType}`);
    }

    // Clearance status filter
    if (filters.clearanceStatus) {
        conditions.push(sql`${user.clearanceStatus} = ${filters.clearanceStatus}`);
    }

    // Account creation date range
    if (filters.dateFrom && filters.dateFrom.trim()) {
        conditions.push(gte(user.createdAt, new Date(filters.dateFrom)));
    }
    if (filters.dateTo && filters.dateTo.trim()) {
        // Include the full day by extending to end of day
        const end = new Date(filters.dateTo);
        end.setHours(23, 59, 59, 999);
        conditions.push(lte(user.createdAt, end));
    }

    return conditions;
}

// ---------------------------------------------------------------------------
// searchTaxpayers — main search server action
// ---------------------------------------------------------------------------

export async function searchTaxpayers(
    filters: TaxpayerSearchFilters,
    page = 1,
): Promise<TaxpayerSearchResult> {
    const { user: actor } = await requireRRAPermission("taxpayer.intelligence.search");

    // Validate inputs before hitting DB
    const validationError = validateSearchFilters(filters);
    if (validationError) throw new Error(validationError);

    const conditions = buildFilterConditions(filters);
    const whereClause = and(...conditions);

    const safePage = Math.max(1, page);
    const offset = (safePage - 1) * PAGE_SIZE;

    // Count total and fetch current page in parallel
    const [countResult, rows] = await Promise.all([
        db.select({ count: count() }).from(user).where(whereClause),
        db
            .select({
                id: user.id,
                name: user.name,
                businessName: user.businessName,
                tinNumber: user.tinNumber,
                role: user.role,
                businessType: user.businessType,
                clearanceStatus: user.clearanceStatus,
                email: user.email,
                phoneNumber: user.phoneNumber,
                createdAt: user.createdAt,
            })
            .from(user)
            .where(whereClause)
            .orderBy(asc(user.businessName))
            .limit(PAGE_SIZE)
            .offset(offset),
    ]);

    const totalRows = Number(countResult[0]?.count ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
    const clampedPage = Math.max(1, Math.min(safePage, totalPages));

    // Re-fetch if page was out of range
    let finalRows = rows;
    if (clampedPage !== safePage) {
        finalRows = await db
            .select({
                id: user.id,
                name: user.name,
                businessName: user.businessName,
                tinNumber: user.tinNumber,
                role: user.role,
                businessType: user.businessType,
                clearanceStatus: user.clearanceStatus,
                email: user.email,
                phoneNumber: user.phoneNumber,
                createdAt: user.createdAt,
            })
            .from(user)
            .where(whereClause)
            .orderBy(asc(user.businessName))
            .limit(PAGE_SIZE)
            .offset((clampedPage - 1) * PAGE_SIZE);
    }

    // Audit log — record that a search was made; never log result data
    await logAudit({
        userId: actor.id,
        action: "TAXPAYER_INTELLIGENCE_SEARCH",
        targetType: "user",
        metadata: {
            filters: {
                hasQuery: Boolean(filters.query && filters.query.trim().length >= 2),
                role: filters.role || null,
                businessType: filters.businessType || null,
                clearanceStatus: filters.clearanceStatus || null,
                hasDateFrom: Boolean(filters.dateFrom && filters.dateFrom.trim()),
                hasDateTo: Boolean(filters.dateTo && filters.dateTo.trim()),
            },
            resultCount: totalRows,
            page: clampedPage,
        },
    });

    return {
        rows: finalRows,
        totalRows,
        totalPages,
        page: clampedPage,
        pageSize: PAGE_SIZE,
    };
}
