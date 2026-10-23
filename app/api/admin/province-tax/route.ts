import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import db from "@/db/drizzle";
import { user, vatRecord, taxPayment } from "@/db/schema";
import { sql, eq } from "drizzle-orm";

export interface ProvincePoint {
    province: string;
    vatCollected: number;
    taxPaid: number;
    traderCount: number;
    compliancePct: number;
}

export interface ProvinceTaxData {
    provinces: ProvincePoint[];
    topProvince: string | null;
    totalVat: number;
}

const PROVINCE_MAP: Record<string, string[]> = {
    Kigali: ["KGL", "Kigali"],
    Northern: ["NP", "Northern", "Musanze", "Rubavu"],
    Southern: ["SP", "Southern", "Huye", "Muhanga"],
    Eastern: ["EP", "Eastern", "Rwamagana", "Nyagatare"],
    Western: ["WP", "Western", "Rusizi", "Karongi"],
};

export async function GET() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return new Response("Unauthorized", { status: 401 });

    try {
        const traders = await db
            .select({ id: user.id, province: user.province })
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

        const buckets = new Map<string, { vat: number; paid: number; count: number }>();
        for (const [name] of Object.entries(PROVINCE_MAP)) {
            buckets.set(name, { vat: 0, paid: 0, count: 0 });
        }

        for (const t of traders) {
            const prov = t.province ?? "";
            const match =
                Object.entries(PROVINCE_MAP).find(([, keywords]) =>
                    keywords.some((k) => prov.toLowerCase().includes(k.toLowerCase()))
                )?.[0] ?? "Kigali";
            const b = buckets.get(match)!;
            b.count++;
            b.vat += vatMap.get(t.id) ?? 0;
            b.paid += payMap.get(t.id) ?? 0;
        }

        const provinces: ProvincePoint[] = [...buckets.entries()].map(([province, b]) => ({
            province,
            vatCollected: b.vat,
            taxPaid: b.paid,
            traderCount: b.count,
            compliancePct: b.vat === 0 ? 100 : Math.min(100, Math.round((b.paid / b.vat) * 1000) / 10),
        }));

        const totalVat = provinces.reduce((s, p) => s + p.vatCollected, 0);
        const topProvince = provinces.sort((a, b) => b.vatCollected - a.vatCollected)[0]?.province ?? null;

        return Response.json({ provinces, topProvince, totalVat } satisfies ProvinceTaxData);
    } catch (err) {
        console.error("[province-tax]", err);
        return Response.json({ provinces: [], topProvince: null, totalVat: 0 } satisfies ProvinceTaxData);
    }
}
