import { NextRequest, NextResponse } from "next/server";
import {
  searchTaxpayersForCurrentAdmin,
  type TaxpayerSearchFilters,
} from "@/lib/taxpayer-search.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * JSON transport for the admin taxpayer search. It uses the same server-side
 * permission check, filtering, projection, and audit trail as the Server
 * Action. This route is used as a client fallback when a stale Server Action
 * manifest or deployment transition prevents the action response from arriving.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ message: "Request origin is not allowed." }, { status: 403 });
  }

  let body: { filters?: TaxpayerSearchFilters; page?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid search request." }, { status: 400 });
  }

  const result = await searchTaxpayersForCurrentAdmin(body?.filters ?? {}, body?.page ?? 1);
  return NextResponse.json(result, { status: result.error ? 503 : 200 });
}
