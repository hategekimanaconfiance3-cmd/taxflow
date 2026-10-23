import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import db from "@/db/drizzle";
import { user, vatRecord, taxPayment } from "@/db/schema";
import { sql, eq } from "drizzle-orm";

export interface SectorRow {
    sector: string;
    traderCount: number;
    vatGenerated: number;
    taxPaid: number;
    compliancePct: number;
}

export interface SectorAnalysisData {
    sectors: SectorRow[];
    topSector: string | null;
}

export async function GET() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return new Response("Unauthorized", { status: 401 });

    try {
        const roles = ["manufacturer", "wholesaler", "retailer"] as const;

        const traders = await db
            .select({ id: user.id, role: user.role })
            .from(user)
            .where(sql`${user.role} IN ('manufacturer','wholesaler','retailer')`);

        const vatRows = await db
            .select({ businessId: vatRecord.businessId, total: sql<number>`COALESCE(SUM(${vatRecord.amount}),0)::float8`.as("total") })
            .from(vatRecord)
            .where(sql`${vatRecord.vatType} = 'output' AND ${vatRecord.isFrozen} = false`)
            .groupBy(vatRecord.businessId);

        const payRows = await db
            .select({ businessId: taxPayment.businessId, total: sql<number>`COALESCE(SUM(${taxPayment.amount}),0)::float8`.as("total") })
            .from(taxPayment)
            .where(eq(taxPayment.status, "confirmed"))
            .groupBy(taxPayment.businessId);

        const vatMap = new Map(vatRows.map((r) => [r.businessId, r.total]));
        const payMap = new Map(payRows.map((r) => [r.businessId, r.total]));

        const sectors: SectorRow[] = roles.map((role) => {
            const group = traders.filter((t) => t.role === role);
            const vat = group.reduce((s, t) => s + (vatMap.get(t.id) ?? 0), 0);
            const paid = group.reduce((s, t) => s + (payMap.get(t.id) ?? 0), 0);
            return {
                sector: role.charAt(0).toUpperCase() + role.slice(1),
                traderCount: group.length,
                vatGenerated: vat,
                taxPaid: paid,
                compliancePct: vat === 0 ? 100 : Math.min(100, Math.round((paid / vat) * 1000) / 10),
            };
        });

        const topSector = [...sectors].sort((a, b) => b.vatGenerated - a.vatGenerated)[0]?.sector ?? null;

        return Response.json({ sectors, topSector } satisfies SectorAnalysisData);
    } catch (err) {
        console.error("[sector-analysis]", err);
        return Response.json({ sectors: [], topSector: null } satisfies SectorAnalysisData);
    }
}
