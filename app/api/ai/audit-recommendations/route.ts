import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getAuditRecommendations } from "@/lib/ai/smart-audit";

// ---------------------------------------------------------------------------
// GET /api/ai/audit-recommendations?limit=20
// Returns AI-driven audit recommendations grouped by district.
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get("limit") ?? "20", 10);
        const clampedLimit = Math.min(Math.max(limit, 5), 50);

        const plan = await getAuditRecommendations(clampedLimit);

        return NextResponse.json(plan, {
            headers: { "Cache-Control": "private, max-age=3600" },
        });
    } catch (error) {
        console.error("Audit recommendations error:", error);
        return NextResponse.json(
            { error: "Failed to generate audit recommendations" },
            { status: 500 },
        );
    }
}
