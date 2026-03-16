import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getSuspiciousTransactions } from "@/lib/actions/suspicious-transactions.action";

export async function GET() {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const data = await getSuspiciousTransactions();

        return NextResponse.json(data, {
            headers: { "Cache-Control": "private, max-age=900" },
        });
    } catch (error) {
        console.error("Suspicious transactions API error:", error);
        return NextResponse.json(
            { error: "Failed to scan suspicious transactions" },
            { status: 500 },
        );
    }
}
