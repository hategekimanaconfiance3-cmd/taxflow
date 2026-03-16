import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getTaxGapData } from "@/lib/actions/tax-gap.action";

// ---------------------------------------------------------------------------
// GET /api/admin/tax-gap
// Returns national tax gap data by sector and trader.
// ---------------------------------------------------------------------------

export async function GET() {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const data = await getTaxGapData();

        return NextResponse.json(data, {
            headers: { "Cache-Control": "private, max-age=1800" },
        });
    } catch (error) {
        console.error("Tax gap error:", error);
        return NextResponse.json(
            { error: "Failed to compute tax gap" },
            { status: 500 },
        );
    }
}
