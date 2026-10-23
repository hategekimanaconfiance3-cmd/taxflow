import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import db from "@/db/drizzle";
import { auditLog, user, taxPayment } from "@/db/schema";
import { sql, desc, eq } from "drizzle-orm";

export type InsightType = "critical" | "warning" | "positive" | "info";

export interface InsightItem {
    id: string;
    type: InsightType;
    title: string;
    description: string;
    href?: string;
    createdAt: string;
}

export interface InsightsFeedData {
    items: InsightItem[];
    hasMore: boolean;
}

export async function GET(request: Request) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return new Response("Unauthorized", { status: 401 });

    try {
        const url = new URL(request.url);
        const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 50);

        const [flags, confirmed] = await Promise.all([
            db.select({
                id: auditLog.id,
                action: auditLog.action,
                targetId: auditLog.targetId,
                metadata: auditLog.metadata,
                createdAt: auditLog.createdAt,
                businessName: user.businessName,
            })
            .from(auditLog)
            .leftJoin(user, sql`${user.id} = ${auditLog.targetId}`)
            .where(sql`${auditLog.action} IN ('SUSPICIOUS_FLAGGED','AUDIT_OPENED','AUDIT_CLOSED')`)
            .orderBy(desc(auditLog.createdAt))
            .limit(limit),

            db.select({
                id: taxPayment.id,
                amount: taxPayment.amount,
                createdAt: taxPayment.createdAt,
                businessName: user.businessName,
            })
            .from(taxPayment)
            .innerJoin(user, sql`${user.id} = ${taxPayment.businessId}`)
            .where(eq(taxPayment.status, "confirmed"))
            .orderBy(desc(taxPayment.createdAt))
            .limit(5),
        ]);

        const items: InsightItem[] = [
            ...flags.map((f) => {
                const meta = (f.metadata ?? {}) as Record<string, unknown>;
                const type: InsightType =
                    f.action === "SUSPICIOUS_FLAGGED" ? "critical"
                    : f.action === "AUDIT_CLOSED" ? "positive"
                    : "warning";
                return {
                    id: f.id,
                    type,
                    title: f.action === "SUSPICIOUS_FLAGGED" ? "Suspicious activity flagged"
                        : f.action === "AUDIT_OPENED" ? "New compliance audit opened"
                        : "Audit case closed",
                    description: String(meta.reason ?? meta.note ?? `${f.businessName ?? "Unknown"} — action recorded`),
                    href: "/admin/audit",
                    createdAt: f.createdAt.toISOString(),
                };
            }),
            ...confirmed.map((p) => ({
                id: `pay-${p.id}`,
                type: "positive" as InsightType,
                title: "Tax payment confirmed",
                description: `${p.businessName ?? "Unknown"} — ${(p.amount ?? 0).toLocaleString()} RWF`,
                href: "/admin/payments",
                createdAt: p.createdAt.toISOString(),
            })),
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
         .slice(0, limit);

        return Response.json({ items, hasMore: items.length === limit } satisfies InsightsFeedData);
    } catch (err) {
        console.error("[insights-feed]", err);
        return Response.json({ items: [], hasMore: false } satisfies InsightsFeedData);
    }
}
