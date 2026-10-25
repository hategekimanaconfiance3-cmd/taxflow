import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import db from "@/db/drizzle";
import tinDb from "@/db/tin-drizzle";
import { user, vatRecord, taxPayment, transaction } from "@/db/schema";
import { tinRecord } from "@/db/tin-schema";
import { eq, inArray, sql } from "drizzle-orm";

export interface ProvincePoint {
    province: string;
    vatReported: number;
    confirmedTaxPayments: number;
    traderCount: number;
    transactionCount: number;
    averageTransactionValue: number;
}

export interface ProvinceTaxData {
    provinces: ProvincePoint[];
    leadingProvince: string | null;
    totalVatReported: number;
    totalConfirmedTaxPayments: number;
    tradersWithoutProvince: number;
}

const PROVINCES = [
    { name: "Kigali City", keywords: ["kigali", "kgl"] },
    { name: "Northern Province", keywords: ["northern", "north", "np"] },
    { name: "Southern Province", keywords: ["southern", "south", "sp"] },
    { name: "Eastern Province", keywords: ["eastern", "east", "ep"] },
    { name: "Western Province", keywords: ["western", "west", "wp"] },
] as const;

function normalizeProvince(value: string | null | undefined): string | null {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) return null;
    return PROVINCES.find(({ name, keywords }) =>
        name.toLowerCase() === normalized || keywords.some((keyword) => normalized.includes(keyword)),
    )?.name ?? null;
}

export async function GET(): Promise<Response> {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return new Response("Unauthorized", { status: 401 });

    try {
        const traders = await db
            .select({ id: user.id, tinNumber: user.tinNumber })
            .from(user)
            .where(sql`${user.role} IN ('manufacturer','wholesaler','retailer')`);

        const tinNumbers = traders.flatMap((trader) => trader.tinNumber ? [trader.tinNumber] : []);
        const [registryRows, vatRows, paymentRows, transactionRows] = await Promise.all([
            tinNumbers.length > 0
                ? tinDb.select({ tinNumber: tinRecord.tinNumber, province: tinRecord.province })
                    .from(tinRecord)
                    .where(inArray(tinRecord.tinNumber, tinNumbers))
                : Promise.resolve([]),
            db.select({
                businessId: vatRecord.businessId,
                vatType: vatRecord.vatType,
                total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as("total"),
            })
                .from(vatRecord)
                .where(eq(vatRecord.isFrozen, false))
                .groupBy(vatRecord.businessId, vatRecord.vatType),
            db.select({
                businessId: taxPayment.businessId,
                total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as("total"),
            })
                .from(taxPayment)
                .where(eq(taxPayment.status, "confirmed"))
                .groupBy(taxPayment.businessId),
            db.select({
                businessId: transaction.sellerId,
                count: sql<number>`COUNT(*)`.as("count"),
                total: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`.as("total"),
            })
                .from(transaction)
                .groupBy(transaction.sellerId),
        ]);

        const provinceByTin = new Map(registryRows.map((row) => [row.tinNumber, normalizeProvince(row.province)]));
        const provinceByBusiness = new Map(traders.map((trader) => [trader.id, provinceByTin.get(trader.tinNumber ?? "") ?? null]));
        const vatByBusiness = new Map<string, { output: number; input: number }>();
        for (const row of vatRows) {
            const current = vatByBusiness.get(row.businessId) ?? { output: 0, input: 0 };
            if (row.vatType === "output") current.output += row.total;
            if (row.vatType === "input") current.input += row.total;
            vatByBusiness.set(row.businessId, current);
        }

        const provinces = new Map<string, ProvincePoint>(PROVINCES.map(({ name }) => [name, {
            province: name,
            vatReported: 0,
            confirmedTaxPayments: 0,
            traderCount: 0,
            transactionCount: 0,
            averageTransactionValue: 0,
        }]));
        let tradersWithoutProvince = 0;
        for (const trader of traders) {
            const province = provinceByBusiness.get(trader.id);
            if (!province) {
                tradersWithoutProvince++;
                continue;
            }
            const point = provinces.get(province);
            if (!point) continue;
            const vat = vatByBusiness.get(trader.id) ?? { output: 0, input: 0 };
            point.vatReported += Math.max(0, vat.output - vat.input);
            point.traderCount++;
        }

        const paymentByBusiness = new Map(paymentRows.map((row) => [row.businessId, row.total]));
        for (const point of provinces.values()) {
            for (const [businessId, province] of provinceByBusiness) {
                if (province === point.province) point.confirmedTaxPayments += paymentByBusiness.get(businessId) ?? 0;
            }
        }

        const transactionByBusiness = new Map(transactionRows.map((row) => [row.businessId, row]));
        for (const point of provinces.values()) {
            let totalTransactionValue = 0;
            for (const [businessId, province] of provinceByBusiness) {
                if (province !== point.province) continue;
                const activity = transactionByBusiness.get(businessId);
                point.transactionCount += activity?.count ?? 0;
                totalTransactionValue += activity?.total ?? 0;
            }
            point.averageTransactionValue = point.transactionCount > 0
                ? totalTransactionValue / point.transactionCount
                : 0;
        }

        const result = [...provinces.values()];
        const totalVatReported = result.reduce((total, point) => total + point.vatReported, 0);
        const totalConfirmedTaxPayments = result.reduce((total, point) => total + point.confirmedTaxPayments, 0);
        const leadingProvince = [...result].sort((a, b) => b.vatReported - a.vatReported)[0]?.province ?? null;

        return Response.json({
            provinces: result,
            leadingProvince,
            totalVatReported,
            totalConfirmedTaxPayments,
            tradersWithoutProvince,
        } satisfies ProvinceTaxData);
    } catch (error) {
        console.error("[province-tax] Failed to build province tax summary", error);
        return Response.json({
            provinces: [],
            leadingProvince: null,
            totalVatReported: 0,
            totalConfirmedTaxPayments: 0,
            tradersWithoutProvince: 0,
        } satisfies ProvinceTaxData, { status: 500 });
    }
}
