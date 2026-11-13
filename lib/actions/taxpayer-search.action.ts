"use server";

import {
    searchTaxpayersForCurrentAdmin,
    type TaxpayerSearchFilters,
    type TaxpayerSearchResult,
} from "@/lib/taxpayer-search.service";

export type { TaxpayerSearchFilters, TaxpayerSearchResult, TaxpayerSearchRow } from "@/lib/taxpayer-search.service";

/** Server Action wrapper. The same authorized query is also exposed through
 * the admin JSON route as a transport fallback for stale action manifests. */
export async function searchTaxpayers(
    filters: TaxpayerSearchFilters,
    page = 1,
): Promise<TaxpayerSearchResult> {
    return searchTaxpayersForCurrentAdmin(filters, page);
}
