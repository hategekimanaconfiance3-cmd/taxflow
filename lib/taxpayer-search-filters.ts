/**
 * Pure filter validation helpers for Taxpayer Intelligence Search.
 * This module has NO server dependencies so it can be imported in tests.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaxpayerSearchFilters {
    // Primary search
    query?: string;

    // Business Details
    role?: "manufacturer" | "wholesaler" | "retailer" | "";
    businessType?: "registered_business" | "institution" | "government" | "large_bulk_buyer" | "";
    clearanceStatus?: "pending" | "approved" | "under_review" | "suspended" | "";

    // Account creation date range
    dateFrom?: string; // ISO date "YYYY-MM-DD"
    dateTo?: string;   // ISO date "YYYY-MM-DD"
}

// ---------------------------------------------------------------------------
// validateSearchFilters — validate date/range inputs before querying
// ---------------------------------------------------------------------------

export function validateSearchFilters(filters: TaxpayerSearchFilters): string | null {
    // Treat empty strings as "not set"
    const dateFrom = filters.dateFrom && filters.dateFrom.trim() ? filters.dateFrom.trim() : null;
    const dateTo = filters.dateTo && filters.dateTo.trim() ? filters.dateTo.trim() : null;

    if (dateFrom) {
        const d = new Date(dateFrom);
        if (isNaN(d.getTime())) return "Invalid 'From' date.";
    }
    if (dateTo) {
        const d = new Date(dateTo);
        if (isNaN(d.getTime())) return "Invalid 'To' date.";
    }
    if (dateFrom && dateTo && dateTo < dateFrom) {
        return "'To' date must be on or after the 'From' date.";
    }
    return null;
}
