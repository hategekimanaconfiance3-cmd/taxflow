import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import db from "@/db/drizzle";
import { vatRecord, taxPayment } from "@/db/schema";
import { sql, eq } from "drizzle-orm";

export interface VatMonthPoint {
    month: string; // "YYYY-MM"
    outputVat: number;
    inputVat: number;
    netVat: number;
    payments: number;
}

export interface VatPerformanceData {
    monthly: VatMonthPoint[];
    totalOutput: number;
    totalNet: number;
    totalPaid: number;
    collectionRate: number;
}

export async function GET() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return new Response("Unauthorized", { status: 401 });

    try {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const [vatRows, payRows] = await Promise.all([
            db.select({
                month: sql<string>`TO_CHAR(${vatRecord.createdAt}, 'YYYY-MM')`.as("month"),
                vatType: vatRecord.vatType,
                total: sql<number>`COALESCE(SUM(${vatRecord.amount}),0)::float8`.as("total"),
            })
            .from(vatRecord)
            .where(sql`${vatRecord.createdAt} >= ${sixMonthsAgo} AND ${vatRecord.isFrozen} = false`)
            .groupBy(sql`TO_CHAR(${vatRecord.createdAt}, 'YYYY-MM')`, vatRecord.vatType),

            db.select({
                month: sql<string>`TO_CHAR(${taxPayment.createdAt}, 'YYYY-MM')`.as("month"),
                total: sql<number>`COALESCE(SUM(${taxPayment.amount}),0)::float8`.as("total"),
            })
            .from(taxPayment)
            .where(sql`${taxPayment.createdAt} >= ${sixMonthsAgo} AND ${taxPayment.status} = 'confirmed'`)
            .groupBy(sql`TO_CHAR(${taxPayment.createdAt}, 'YYYY-MM')`),
        ]);

        const months = [...new Set([...vatRows.map((r) => r.month), ...payRows.map((r) => r.month)])].sort();

        const monthly: VatMonthPoint[] = months.map((month) => {
            const output = vatRows.find((r) => r.month === month && r.vatType === "output")?.total ?? 0;
            const input = vatRows.find((r) => r.month === month && r.vatType === "input")?.total ?? 0;
            const payments = payRows.find((r) => r.month === month)?.total ?? 0;
            return { month, outputVat: output, inputVat: input, netVat: Math.max(0, output - input), payments };
        });

        const totalOutput = monthly.reduce((s, m) => s + m.outputVat, 0);
        const totalNet = monthly.reduce((s, m) => s + m.netVat, 0);
        const totalPaid = monthly.reduce((s, m) => s + m.payments, 0);

        return Response.json({
            monthly,
            totalOutput,
            totalNet,
            totalPaid,
            collectionRate: totalNet === 0 ? 100 : Math.min(100, Math.round((totalPaid / totalNet) * 1000) / 10),
        } satisfies VatPerformanceData);
    } catch (err) {
        console.error("[vat-performance]", err);
        return Response.json({ monthly: [], totalOutput: 0, totalNet: 0, totalPaid: 0, collectionRate: 0 } satisfies VatPerformanceData);
    }
}
