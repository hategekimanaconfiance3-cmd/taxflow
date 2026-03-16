import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getSupplyChainStats } from "@/lib/actions/supply-chain-stats.action";

export async function GET() {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const data = await getSupplyChainStats();

        return NextResponse.json(data, {
            headers: { "Cache-Control": "private, max-age=900" },
        });
    } catch (error) {
        console.error("Supply chain API error:", error);
        return NextResponse.json(
            { error: "Failed to get supply chain stats" },
            { status: 500 },
        );
    }
}
