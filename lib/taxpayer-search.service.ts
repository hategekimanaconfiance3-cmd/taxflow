
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
        failurePhase: string;
    };
}

const PAGE_SIZE = 20;
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const optionalIsoDateFilterSchema = z.union([isoDateSchema, z.literal("")]);
const taxpayerSearchFiltersSchema = z.object({
  query: z.string().max(120).optional(),
  role: z.enum(["manufacturer", "wholesaler", "retailer", ""]).optional(),
  clearanceStatus: z.enum(["pending", "approved", "under_review", "suspended", ""]).optional(),
  dateFrom: optionalIsoDateFilterSchema.optional(),
  dateTo: optionalIsoDateFilterSchema.optional(),
}).strict();

function getSafeSqlState(error: unknown): string | null {
    let current: unknown = error;
    for (let depth = 0; depth < 4 && typeof current === "object" && current !== null; depth++) {
        if ("code" in current) {
            const code = current.code;
            if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
        }
        current = "cause" in current ? current.cause : null;
    }
    return null;
}

function failedSearchResult(page: number, error: unknown, failurePhase: string): TaxpayerSearchResult {
    const reference = randomUUID();
    const errorName = error instanceof Error ? error.name : "UnknownError";
    const diagnosticCode = getSafeSqlState(error);
    console.error("[taxpayer-search] action failed", { reference, errorName, diagnosticCode, failurePhase });
    return {
        rows: [],
        totalRows: 0,
        totalPages: 1,
        page,
        pageSize: PAGE_SIZE,
        error: {
            message: "Taxpayer search is temporarily unavailable.",
            reference,
            diagnosticCode,
            failurePhase,
        },
    };
}

// ---------------------------------------------------------------------------
// searchTaxpayers — main search action
// ---------------------------------------------------------------------------

export async function searchTaxpayersForCurrentAdmin(
    filters: TaxpayerSearchFilters,
    page = 1,
): Promise<TaxpayerSearchResult> {
    const requestedPage = Math.max(1, Math.floor(Number.isFinite(page) ? page : 1));
    let failurePhase = "authorization";
    try {
        const { user: actor, staff } = await requireRRAPermission("taxpayer.intelligence.search");
        failurePhase = "validation";
        const canReadContact = canReadTaxpayerSearchContact(staff.clearanceRoles);
        const parsedFilters = taxpayerSearchFiltersSchema.safeParse(filters);
        if (!parsedFilters.success) return failedSearchResult(requestedPage, new Error("Invalid taxpayer search filters."), failurePhase);
        const searchFilters = parsedFilters.data;

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

        // Count total matching rows
        failurePhase = "count_query";
        const [countResult] = await db
            .select({ count: sql<number>`COUNT(*)::int`.as("count") })
            .from(user)
            .where(whereClause);

        const totalRows = Number(countResult?.count ?? 0);
        const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
        const safePage = Math.min(requestedPage, totalPages);
        const offset = (safePage - 1) * PAGE_SIZE;

        // Fetch paginated rows
        failurePhase = "results_query";
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
        const projectedRows = rows.map((row) => projectTaxpayerSearchRow(row, staff.clearanceRoles));

        // Audit log — record that a search was made, but never log the result data
        failurePhase = "audit_log";
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
        } catch {
            console.error("[taxpayer-search] audit log failed");
        }

        return {
            rows: projectedRows,
            totalRows,
            totalPages,
            page: safePage,
            pageSize: PAGE_SIZE,
        };
    } catch (error) {
        return failedSearchResult(requestedPage, error, failurePhase);
    }
}

