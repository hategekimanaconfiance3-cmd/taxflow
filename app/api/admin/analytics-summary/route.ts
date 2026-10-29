import { requireAnyRRAPermission } from "@/lib/auth-guard";
import { hasRRAPermission } from "@/lib/rra-rbac";
import db from "@/db/drizzle";
import { user, taxPayment, auditLog } from "@/db/schema";
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
    const { staff } = await requireAnyRRAPermission("analytics.read", "reports.aggregate.read");
    const canReadCompliance = staff.clearanceRoles.some((role) => hasRRAPermission(role, "taxpayer.compliance.read"));
    const canReadPayments = staff.clearanceRoles.some((role) => hasRRAPermission(role, "payments.read"));
    const canReadFindings = staff.clearanceRoles.some((role) => hasRRAPermission(role, "ai.findings.read") || hasRRAPermission(role, "audit.trail.read"));
    const canSearchTaxpayers = staff.clearanceRoles.some((role) => hasRRAPermission(role, "taxpayer.intelligence.search"));

    try {
        const [pending, suspended, recentAudits] = await Promise.all([
            canReadPayments ? db.select({ count: sql<number>`COUNT(*)`.as("count") }).from(taxPayment).where(eq(taxPayment.status, "pending")) : Promise.resolve([]),
            canReadCompliance ? db.select({ count: sql<number>`COUNT(*)`.as("count") }).from(user).where(sql`${user.role} IN ('manufacturer','wholesaler','retailer') AND ${user.isActive} = false`) : Promise.resolve([]),
            canReadFindings ? db.select({ count: sql<number>`COUNT(*)`.as("count") }).from(auditLog).where(sql`${auditLog.action} = 'SUSPICIOUS_FLAGGED' AND ${auditLog.createdAt} >= NOW() - INTERVAL '7 days'`) : Promise.resolve([]),
        ]);

        const insights: AnalyticsInsight[] = [];

        const pendingCount = pending[0]?.count ?? 0;
        const suspendedCount = suspended[0]?.count ?? 0;
        const recentFlags = recentAudits[0]?.count ?? 0;

        if (recentFlags > 0) {
            insights.push({ id: "recent-flags", severity: "critical", title: `${recentFlags} suspicious activity flag${recentFlags > 1 ? "s" : ""} this week`, description: "Review flagged transactions immediately.", href: staff.clearanceRoles.some((role) => hasRRAPermission(role, "audit.trail.read")) ? "/admin/audit" : "/admin/intelligence/findings" });
        }
        if (suspendedCount > 0) {
            insights.push({ id: "suspended", severity: "warning", title: `${suspendedCount} suspended trader${suspendedCount > 1 ? "s" : ""}`, description: "Suspended accounts require review before reinstatement.", ...(canSearchTaxpayers ? { href: "/admin/traders" } : {}) });
        }
        if (pendingCount > 5) {
            insights.push({ id: "pending-pay", severity: "warning", title: `${pendingCount} pending payments awaiting review`, description: "Payments pending more than 48 hours need attention.", href: "/admin/payments" });
        }
        if (insights.length === 0) {
            insights.push({ id: "all-ok", severity: "ok", title: "No authorized alerts", description: "There are no alerts in the information available to your role." });
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
