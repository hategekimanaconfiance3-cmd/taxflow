import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import db from "@/db/drizzle";
import { auditLog, user, taxPayment } from "@/db/schema";
import { sql, desc, eq } from "drizzle-orm";

export type DecisionSeverity = "critical" | "high" | "medium" | "low";

export interface DecisionAction {
    id: string;
    label: string;
    href: string;
    variant?: "default" | "destructive" | "outline";
}

export interface DecisionItem {
    id: string;
    severity: DecisionSeverity;
    title: string;
    description: string;
    targetId?: string;
    targetName?: string;
    actions: DecisionAction[];
    createdAt: string;
}

export interface DecisionPanelData {
    decisions: DecisionItem[];
    pendingCount: number;
}

export async function GET() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return new Response("Unauthorized", { status: 401 });

    try {
        const [flags, pendingPayments] = await Promise.all([
            db.select({
                id: auditLog.id,
                targetId: auditLog.targetId,
                metadata: auditLog.metadata,
                createdAt: auditLog.createdAt,
                businessName: user.businessName,
            })
            .from(auditLog)
            .leftJoin(user, sql`${user.id} = ${auditLog.targetId}`)
            .where(sql`${auditLog.action} = 'SUSPICIOUS_FLAGGED'`)
            .orderBy(desc(auditLog.createdAt))
            .limit(5),

            db.select({ count: sql<number>`COUNT(*)`.as("count") })
            .from(taxPayment)
            .where(eq(taxPayment.status, "pending")),
        ]);

        const decisions: DecisionItem[] = flags.map((f) => {
            const meta = (f.metadata ?? {}) as Record<string, unknown>;
            const severity = (meta.severity as DecisionSeverity) ?? "medium";
            return {
                id: f.id,
                severity,
                title: `Suspicious activity flagged`,
                description: String(meta.reason ?? "Suspicious activity detected requiring review."),
                targetId: f.targetId ?? undefined,
                targetName: f.businessName ?? undefined,
                actions: [
                    { id: "view", label: "View Audit Trail", href: "/admin/audit" },
                    { id: "trader", label: "View Trader", href: f.targetId ? `/admin/traders/${f.targetId}` : "/admin/traders" },
                ],
                createdAt: f.createdAt.toISOString(),
            };
        });

        return Response.json({
            decisions,
            pendingCount: pendingPayments[0]?.count ?? 0,
        } satisfies DecisionPanelData);
    } catch (err) {
        console.error("[decision-panel]", err);
        return Response.json({ decisions: [], pendingCount: 0 } satisfies DecisionPanelData);
    }
}
