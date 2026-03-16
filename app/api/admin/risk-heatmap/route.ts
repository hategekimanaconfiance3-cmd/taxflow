import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getRiskHeatmap } from "@/lib/actions/risk-heatmap.action";

// ---------------------------------------------------------------------------
// GET /api/admin/risk-heatmap
// Returns risk tier distribution for compliance heatmap.
// ---------------------------------------------------------------------------

export async function GET() {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const data = await getRiskHeatmap();

        return NextResponse.json(data, {
            headers: { "Cache-Control": "private, max-age=1800" },
        });
    } catch (error) {
        console.error("Risk heatmap error:", error);
        return NextResponse.json(
            { error: "Failed to compute risk heatmap" },
            { status: 500 },
        );
    }
}
