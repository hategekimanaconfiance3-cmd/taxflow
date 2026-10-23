import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import db from "@/db/drizzle";
import { user, taxPayment, vatRecord, auditLog } from "@/db/schema";
import { sql, eq } from "drizzle-orm";

export type InsightSeverity = "critical" | "warning" | "ok" | "info";

export interface AnalyticsInsight {
    id: string;
    severity: InsightSeverity;
    title: string;
    description: string;
    href?: string;
}

export interface AnalyticsSummary {
    insights: AnalyticsInsight[];
    criticalCount: number;
    warningCount: number;
}

export async function GET() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return new Response("Unauthorized", { status: 401 });

    try {
        const [pending, suspended, nonCompliant, recentAudits] = await Promise.all([
            db.select({ count: sql<number>`COUNT(*)`.as("count") }).from(taxPayment).where(eq(taxPayment.status, "pending")),
            db.select({ count: sql<number>`COUNT(*)`.as("count") }).from(user).where(sql`${user.role} IN ('manufacturer','wholesaler','retailer') AND ${user.isActive} = false`),
            db.select({ count: sql<number>`COUNT(DISTINCT ${vatRecord.businessId})`.as("count") }).from(vatRecord).where(sql`${vatRecord.isFrozen} = false AND ${vatRecord.vatType} = 'output'`),
            db.select({ count: sql<number>`COUNT(*)`.as("count") }).from(auditLog).where(sql`${auditLog.action} = 'SUSPICIOUS_FLAGGED' AND ${auditLog.createdAt} >= NOW() - INTERVAL '7 days'`),
        ]);

        const insights: AnalyticsInsight[] = [];

        const pendingCount = pending[0]?.count ?? 0;
        const suspendedCount = suspended[0]?.count ?? 0;
        const recentFlags = recentAudits[0]?.count ?? 0;

        if (recentFlags > 0) {
            insights.push({ id: "recent-flags", severity: "critical", title: `${recentFlags} suspicious activity flag${recentFlags > 1 ? "s" : ""} this week`, description: "Review flagged transactions immediately.", href: "/admin/audit" });
        }
        if (suspendedCount > 0) {
            insights.push({ id: "suspended", severity: "warning", title: `${suspendedCount} suspended trader${suspendedCount > 1 ? "s" : ""}`, description: "Suspended accounts require review before reinstatement.", href: "/admin/traders" });
        }
        if (pendingCount > 5) {
            insights.push({ id: "pending-pay", severity: "warning", title: `${pendingCount} pending payments awaiting review`, description: "Payments pending more than 48 hours need attention.", href: "/admin/payments" });
        }
        if (insights.length === 0) {
            insights.push({ id: "all-ok", severity: "ok", title: "All systems normal", description: "No critical issues detected in the last 7 days." });
        }

        return Response.json({
            insights,
            criticalCount: insights.filter((i) => i.severity === "critical").length,
            warningCount: insights.filter((i) => i.severity === "warning").length,
        } satisfies AnalyticsSummary);
    } catch (err) {
        console.error("[analytics-summary]", err);
        return Response.json({ insights: [], criticalCount: 0, warningCount: 0 } satisfies AnalyticsSummary);
    }
}
