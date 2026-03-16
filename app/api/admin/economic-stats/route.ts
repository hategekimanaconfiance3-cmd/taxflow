import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getEconomicStats } from "@/lib/actions/economic-stats.action";

export async function GET() {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const data = await getEconomicStats();

        return NextResponse.json(data, {
            headers: { "Cache-Control": "private, max-age=3600" },
        });
    } catch (error) {
        console.error("Economic stats API error:", error);
        return NextResponse.json(
            { error: "Failed to compute economic stats" },
            { status: 500 },
        );
    }
}
