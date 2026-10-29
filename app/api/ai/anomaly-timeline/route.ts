import { requireAnyRRAPermission } from "@/lib/auth-guard";
import db from "@/db/drizzle";
import { auditLog } from "@/db/schema";
import { sql, desc } from "drizzle-orm";

export interface TimelinePoint {
    date: string; // "YYYY-MM-DD"
    anomalyCount: number;
    suspiciousCount: number;
    auditCount: number;
}

export interface AnomalyTimelineData {
    timeline: TimelinePoint[];
    totalAnomalies: number;
    trend: "up" | "down" | "stable";
}

export async function GET() {
    await requireAnyRRAPermission("ai.findings.read", "audit.trail.read", "investigation.case.manage");

    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const rows = await db.select({
            date: sql<string>`TO_CHAR(${auditLog.createdAt}, 'YYYY-MM-DD')`.as("date"),
            action: auditLog.action,
            count: sql<number>`COUNT(*)`.as("count"),
        })
        .from(auditLog)
        .where(sql`${auditLog.createdAt} >= ${thirtyDaysAgo} AND ${auditLog.action} IN ('SUSPICIOUS_FLAGGED','AUDIT_OPENED','AUDIT_CLOSED','AUDIT_PROGRESSED','AUDIT_NOTE_ADDED')`)
        .groupBy(sql`TO_CHAR(${auditLog.createdAt}, 'YYYY-MM-DD')`, auditLog.action)
        .orderBy(desc(sql`TO_CHAR(${auditLog.createdAt}, 'YYYY-MM-DD')`));

        const dateMap = new Map<string, TimelinePoint>();
        for (const row of rows) {
            if (!dateMap.has(row.date)) {
                dateMap.set(row.date, { date: row.date, anomalyCount: 0, suspiciousCount: 0, auditCount: 0 });
            }
            const p = dateMap.get(row.date)!;
            if (row.action === "SUSPICIOUS_FLAGGED") p.suspiciousCount += row.count;
            else if (row.action === "AUDIT_OPENED") p.auditCount += row.count;
            p.anomalyCount += row.count;
        }

        const timeline = [...dateMap.values()].sort((a, b) => a.date.localeCompare(b.date));
        const totalAnomalies = timeline.reduce((s, p) => s + p.anomalyCount, 0);

        // Simple trend: compare first half vs second half
        const mid = Math.floor(timeline.length / 2);
        const firstHalf = timeline.slice(0, mid).reduce((s, p) => s + p.anomalyCount, 0);
        const secondHalf = timeline.slice(mid).reduce((s, p) => s + p.anomalyCount, 0);
        const trend: "up" | "down" | "stable" = secondHalf > firstHalf * 1.1 ? "up" : secondHalf < firstHalf * 0.9 ? "down" : "stable";

        return Response.json({ timeline, totalAnomalies, trend } satisfies AnomalyTimelineData);
    } catch (err) {
        console.error("[anomaly-timeline]", err);
        return Response.json({ timeline: [], totalAnomalies: 0, trend: "stable" } satisfies AnomalyTimelineData);
    }
}
