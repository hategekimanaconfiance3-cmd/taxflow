"use server";

import { randomUUID } from "node:crypto";
import { and, asc, gte, ilike, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
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
  error?: {
    message: string;
    reference: string;
    diagnosticCode: string | null;
  };
}

const PAGE_SIZE = 20;
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const taxpayerSearchFiltersSchema = z.object({
  query: z.string().max(120).optional(),
  role: z.enum(["manufacturer", "wholesaler", "retailer", ""]).optional(),
  clearanceStatus: z.enum(["pending", "approved", "under_review", "suspended", ""]).optional(),
  dateFrom: isoDateSchema.optional(),
  dateTo: isoDateSchema.optional(),
}).strict();

function getSafeSqlState(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  const code = error.code;
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : null;
}

// ---------------------------------------------------------------------------
// searchTaxpayers — main search action
// ---------------------------------------------------------------------------

export async function searchTaxpayers(
    filters: TaxpayerSearchFilters,
    page = 1,
): Promise<TaxpayerSearchResult> {
    // Wrap auth so redirect() (NEXT_REDIRECT) is converted to a serialisable Error.
    let actor: Awaited<ReturnType<typeof requireRRAPermission>>["user"];
    let staff: Awaited<ReturnType<typeof requireRRAPermission>>["staff"];
    try {
        const session = await requireRRAPermission("taxpayer.intelligence.search");
        actor = session.user;
        staff = session.staff;
    } catch (authErr) {
        if (authErr instanceof Error) throw authErr;
        throw new Error("You are not authorised to search taxpayer records.");
    }
    const canReadContact = canReadTaxpayerSearchContact(staff.clearanceRoles);
    const parsedFilters = taxpayerSearchFiltersSchema.safeParse(filters);
    if (!parsedFilters.success) throw new Error("Search filters are invalid.");
    const searchFilters = parsedFilters.data;
    const requestedPage = Math.max(1, Math.floor(Number.isFinite(page) ? page : 1));

    // Build WHERE conditions
    const conditions = [
        // Always restrict to trader roles only
        sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
    ];

    // Text search across TIN, business name, name
    if (searchFilters.query && searchFilters.query.trim().length >= 2) {
        const q = `%${searchFilters.query.trim()}%`;
        const searchableFields = [
            ilike(user.tinNumber, q),
            ilike(user.businessName, q),
            ilike(user.name, q),
        ];
        if (canReadContact) searchableFields.push(ilike(user.email, q));
        conditions.push(or(...searchableFields)!);
    }

    // Role filter
    if (searchFilters.role) {
        conditions.push(sql`${user.role} = ${searchFilters.role}`);
    }

    // Clearance status filter
    if (searchFilters.clearanceStatus) {
        conditions.push(sql`${user.clearanceStatus} = ${searchFilters.clearanceStatus}`);
    }

    // Date range
    if (searchFilters.dateFrom) {
        conditions.push(gte(user.createdAt, new Date(searchFilters.dateFrom)));
    }
    if (searchFilters.dateTo) {
        // Include the full day by extending to end of day
        const end = new Date(searchFilters.dateTo);
        end.setHours(23, 59, 59, 999);
        conditions.push(lte(user.createdAt, end));
    }

    const whereClause = and(...conditions);

    let totalRows: number;
    let totalPages: number;
    let safePage: number;
    let projectedRows: TaxpayerSearchRow[];
    try {
        // Count total matching rows
        const [countResult] = await db
            .select({ count: sql<number>`COUNT(*)::int`.as("count") })
            .from(user)
            .where(whereClause);

        totalRows = Number(countResult?.count ?? 0);
        totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
        safePage = Math.min(requestedPage, totalPages);
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
        projectedRows = rows.map((row) => projectTaxpayerSearchRow(row, staff.clearanceRoles));
    } catch (queryError) {
        const reference = randomUUID();
        const errorName = queryError instanceof Error ? queryError.name : "UnknownError";
        const diagnosticCode = getSafeSqlState(queryError);
        console.error("[taxpayer-search] query failed", { reference, errorName, diagnosticCode });
        return {
            rows: [],
            totalRows: 0,
            totalPages: 1,
            page: requestedPage,
            pageSize: PAGE_SIZE,
            error: {
                message: "Taxpayer search is temporarily unavailable.",
                reference,
                diagnosticCode,
            },
        };
    }

    // Audit log — record that a search was made, but never log the result data
    try {
    await logAudit({
        userId: actor.id,
        action: "TAXPAYER_INTELLIGENCE_SEARCH",
        targetType: "user",
        metadata: {
            filters: {
                hasQuery: Boolean(searchFilters.query && searchFilters.query.trim().length >= 2),
                role: searchFilters.role || null,
                clearanceStatus: searchFilters.clearanceStatus || null,
                hasDateFrom: Boolean(searchFilters.dateFrom),
                hasDateTo: Boolean(searchFilters.dateTo),
            },
            resultCount: totalRows,
            page: safePage,
        },
    });
    } catch (auditErr) {
        console.error("[taxpayer-search] audit log failed", auditErr instanceof Error ? auditErr.message : typeof auditErr);
    }

    return {
        rows: projectedRows,
        totalRows,
        totalPages,
        page: safePage,
        pageSize: PAGE_SIZE,
    };
}
