import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { computeRiskScore, computeAllRiskScores } from "@/lib/ai/risk-scoring";

// ---------------------------------------------------------------------------
// GET /api/ai/risk-score?merchantId=xxx  — single merchant
// GET /api/ai/risk-score?all=true        — all merchants (RRA only)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const merchantId = searchParams.get("merchantId");
        const all = searchParams.get("all");

        if (all === "true") {
            const scores = await computeAllRiskScores();
            return NextResponse.json({ scores }, {
                headers: { "Cache-Control": "private, max-age=1800" },
            });
        }

        if (!merchantId) {
            return NextResponse.json({ error: "merchantId is required" }, { status: 400 });
        }

        const score = await computeRiskScore(merchantId);
        return NextResponse.json(score, {
            headers: { "Cache-Control": "private, max-age=1800" },
        });
    } catch (error) {
        console.error("Risk score error:", error);
        return NextResponse.json(
            { error: "Failed to compute risk score" },
            { status: 500 },
        );
    }
}
