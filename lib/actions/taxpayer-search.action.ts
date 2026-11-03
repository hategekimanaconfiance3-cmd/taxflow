"use server";

import { and, asc, gte, ilike, lte, or, sql } from "drizzle-orm";
import db from "@/db/drizzle";
import { user } from "@/db/schema";
import { requireRRAPermission } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";
import {
    canReadTaxpayerSearchContact,
    projectTaxpayerSearchRow,
    type TaxpayerSearchRow,
} from "@/lib/taxpayer-search-policy";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaxpayerSearchFilters {
    query?: string;
    role?: "manufacturer" | "wholesaler" | "retailer" | "";
    clearanceStatus?: "pending" | "approved" | "under_review" | "suspended" | "";
    dateFrom?: string; // ISO date "YYYY-MM-DD"
    dateTo?: string;   // ISO date "YYYY-MM-DD"
}

export type { TaxpayerSearchRow };

export interface TaxpayerSearchResult {
    rows: TaxpayerSearchRow[];
    totalRows: number;
    totalPages: number;
    page: number;
    pageSize: number;
}

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// searchTaxpayers — main search action
// ---------------------------------------------------------------------------

export async function searchTaxpayers(
    filters: TaxpayerSearchFilters,
    page = 1,
): Promise<TaxpayerSearchResult> {
    const { user: actor, staff } = await requireRRAPermission("taxpayer.intelligence.search");
    const canReadContact = canReadTaxpayerSearchContact(staff.clearanceRoles);

    // Build WHERE conditions
    const conditions = [
        // Always restrict to trader roles only
        sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
    ];

    // Text search across TIN, business name, name
    if (filters.query && filters.query.trim().length >= 2) {
        const q = `%${filters.query.trim()}%`;
        const searchableFields = [
            ilike(user.tinNumber, q),
            ilike(user.businessName, q),
            ilike(user.name, q),
        ];
        if (canReadContact) searchableFields.push(ilike(user.email, q));
        conditions.push(or(...searchableFields)!);
    }

    // Role filter
    if (filters.role) {
        conditions.push(sql`${user.role} = ${filters.role}`);
    }

    // Clearance status filter
    if (filters.clearanceStatus) {
        conditions.push(sql`${user.clearanceStatus} = ${filters.clearanceStatus}`);
    }

    // Date range
    if (filters.dateFrom) {
        conditions.push(gte(user.createdAt, new Date(filters.dateFrom)));
    }
    if (filters.dateTo) {
        // Include the full day by extending to end of day
        const end = new Date(filters.dateTo);
        end.setHours(23, 59, 59, 999);
        conditions.push(lte(user.createdAt, end));
    }

    const whereClause = and(...conditions);

    // Count total matching rows
    const [countResult] = await db
        .select({ count: sql<number>`COUNT(*)::int`.as("count") })
        .from(user)
        .where(whereClause);

    const totalRows = Number(countResult?.count ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
    const safePage = Math.max(1, Math.min(page, totalPages));
    const offset = (safePage - 1) * PAGE_SIZE;

    // Fetch paginated rows
    const rows = await db
        .select({
            id: user.id,
            name: user.name,
            businessName: user.businessName,
            tinNumber: user.tinNumber,
            role: user.role,
            clearanceStatus: user.clearanceStatus,
            ...(canReadContact ? { email: user.email, phoneNumber: user.phoneNumber } : {}),
            createdAt: user.createdAt,
        })
        .from(user)
        .where(whereClause)
        .orderBy(asc(user.businessName))
        .limit(PAGE_SIZE)
        .offset(offset);

    // Audit log — record that a search was made, but never log the result data
    await logAudit({
        userId: actor.id,
        action: "TAXPAYER_INTELLIGENCE_SEARCH",
        targetType: "user",
        metadata: {
            filters: {
                hasQuery: Boolean(filters.query && filters.query.trim().length >= 2),
                role: filters.role || null,
                clearanceStatus: filters.clearanceStatus || null,
                hasDateFrom: Boolean(filters.dateFrom),
                hasDateTo: Boolean(filters.dateTo),
            },
            resultCount: totalRows,
            page: safePage,
        },
    });

    return {
        rows: rows.map((row) => projectTaxpayerSearchRow(row, staff.clearanceRoles)),
        totalRows,
        totalPages,
        page: safePage,
        pageSize: PAGE_SIZE,
    };
}
