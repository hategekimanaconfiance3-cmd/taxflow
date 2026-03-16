import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getPriceSuggestion } from "@/lib/ai/price-suggestion";

// ---------------------------------------------------------------------------
// GET /api/ai/price-suggestion?productId=xxx
// Returns AI-computed price range for the authenticated seller.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }

        const { searchParams } = new URL(request.url);
        const productId = searchParams.get("productId");

        if (!productId) {
            return NextResponse.json(
                { error: "productId is required" },
                { status: 400 },
            );
        }

        const suggestion = await getPriceSuggestion(productId, session.user.id);

        return NextResponse.json(suggestion, {
            headers: {
                // Cache for 1 hour per product + user
                "Cache-Control": "private, max-age=3600, stale-while-revalidate=1800",
            },
        });
    } catch (error) {
        console.error("AI price suggestion error:", error);
        return NextResponse.json(
            { error: "Failed to compute price suggestion" },
            { status: 500 },
        );
    }
}
