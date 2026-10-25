import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import db from "@/db/drizzle";
import { transaction, importDeclaration, taxPayment, user } from "@/db/schema";
import { sql, desc } from "drizzle-orm";

export type TickerEventType = "transaction" | "import" | "payment";

export interface TickerItem {
    id: string;
    type: TickerEventType;
    businessName: string;
    amount: number;
    status: string;
    createdAt: string;
}

export interface TickerRow {
    items: TickerItem[];
}

export async function GET() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return new Response("Unauthorized", { status: 401 });

    try {
        const [txns, imports, payments] = await Promise.all([
            db.select({
                id: transaction.id,
                businessName: user.businessName,
                amount: transaction.totalAmount,
                status: transaction.status,
                createdAt: transaction.createdAt,
            })
            .from(transaction)
            .innerJoin(user, sql`${user.id} = ${transaction.sellerId}`)
            .orderBy(desc(transaction.createdAt))
            .limit(10),

            db.select({
                id: importDeclaration.id,
                businessName: user.businessName,
                amount: importDeclaration.estimatedValue,
                status: importDeclaration.status,
                createdAt: importDeclaration.createdAt,
            })
            .from(importDeclaration)
            .innerJoin(user, sql`${user.id} = ${importDeclaration.businessId}`)
            .orderBy(desc(importDeclaration.createdAt))
            .limit(5),

            db.select({
                id: taxPayment.id,
                businessName: user.businessName,
                amount: taxPayment.amount,
                status: taxPayment.status,
                createdAt: taxPayment.createdAt,
            })
            .from(taxPayment)
            .innerJoin(user, sql`${user.id} = ${taxPayment.businessId}`)
            .orderBy(desc(taxPayment.createdAt))
            .limit(5),
        ]);

        const items: TickerItem[] = [
            ...txns.map((t) => ({ id: t.id, type: "transaction" as const, businessName: t.businessName ?? "Unknown", amount: t.amount ?? 0, status: t.status ?? "unknown", createdAt: t.createdAt.toISOString() })),
            ...imports.map((i) => ({ id: i.id, type: "import" as const, businessName: i.businessName ?? "Unknown", amount: i.amount ?? 0, status: i.status ?? "unknown", createdAt: i.createdAt.toISOString() })),
            ...payments.map((p) => ({ id: p.id, type: "payment" as const, businessName: p.businessName ?? "Unknown", amount: p.amount ?? 0, status: p.status ?? "unknown", createdAt: p.createdAt.toISOString() })),
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 20);

        return Response.json({ items } satisfies TickerRow);
    } catch (err) {
        console.error("[ticker]", err);
        return Response.json({ items: [] } satisfies TickerRow);
    }
}
