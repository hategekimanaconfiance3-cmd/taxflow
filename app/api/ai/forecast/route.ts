import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getRevenueForecast } from "@/lib/ai/revenue-forecast";

// ---------------------------------------------------------------------------
// GET /api/ai/forecast?months=6
// Returns revenue forecast data for RRA dashboard.
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
        const months = parseInt(searchParams.get("months") ?? "6", 10);
        const clampedMonths = Math.min(Math.max(months, 1), 12);

        const forecast = await getRevenueForecast(clampedMonths);

        return NextResponse.json(forecast, {
            headers: { "Cache-Control": "private, max-age=3600" },
        });
    } catch (error) {
        console.error("Forecast error:", error);
        return NextResponse.json(
            { error: "Failed to generate forecast" },
            { status: 500 },
        );
    }
}
