import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import db from "@/db/drizzle";
import { auditLog, user, taxPayment, rraStaff, rraStaffRole } from "@/db/schema";
import { sql, desc, eq } from "drizzle-orm";
import { hasRRAPermission, isRRARole } from "@/lib/rra-rbac";

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

    const [staff] = await db.select({ id: rraStaff.id, clearanceLevel: rraStaff.clearanceLevel, isActive: rraStaff.isActive })
        .from(rraStaff).where(eq(rraStaff.userId, session.user.id)).limit(1);
    if (!staff?.isActive) return new Response("Forbidden", { status: 403 });
    const assignments = await db.select({ role: rraStaffRole.role }).from(rraStaffRole).where(eq(rraStaffRole.staffRecordId, staff.id));
    const roles = [...new Set((assignments.length ? assignments.map(({ role }) => role) : [staff.clearanceLevel]).filter(isRRARole))];
    const operationalRoles = roles.filter((role) => role !== "super_admin");
    const canSeeFindings = operationalRoles.some((role) => hasRRAPermission(role, "ai.findings.read") || hasRRAPermission(role, "investigation.case.manage"));
    const canSeePayments = operationalRoles.some((role) => hasRRAPermission(role, "payments.read"));
    if (!canSeeFindings && !canSeePayments) return new Response("Forbidden", { status: 403 });

    try {
        const url = new URL(request.url);
        const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 50);

        const [flags, confirmed] = await Promise.all([
            canSeeFindings ? db.select({
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
            .limit(limit) : Promise.resolve([]),

            canSeePayments ? db.select({
                id: taxPayment.id,
                amount: taxPayment.amount,
                createdAt: taxPayment.createdAt,
                businessName: user.businessName,
            })
            .from(taxPayment)
            .innerJoin(user, sql`${user.id} = ${taxPayment.businessId}`)
            .where(eq(taxPayment.status, "confirmed"))
            .orderBy(desc(taxPayment.createdAt))
            .limit(5) : Promise.resolve([]),
        ]);

        const items: InsightItem[] = [
            ...flags.map((f) => {
                const meta = (f.metadata ?? {}) as Record<string, unknown>;
                const type: InsightType = f.action === "AUDIT_CLOSED" ? "positive" : "warning";
                return {
                    id: f.id,
                    type,
                    title: f.action === "SUSPICIOUS_FLAGGED" ? "Potential compliance signal — human review required"
                        : f.action === "AUDIT_OPENED" ? "Human compliance review opened"
                        : "Audit case closed by an authorized officer",
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
