"use server";

import { sql, desc, eq } from "drizzle-orm";
import db from "@/db/drizzle";
import { auditLog, user } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditStatus = "open" | "in_progress" | "closed";

export type ComplianceAudit = {
    id: string;
    traderId: string;
    traderName: string;
    status: AuditStatus;
    reason: string;
    openedBy: string;
    openedAt: Date;
    notes: AuditNote[];
};

export type AuditNote = {
    id: string;
    action: string;
    note: string;
    by: string;
    at: Date;
};

// ---------------------------------------------------------------------------
// Start a compliance audit for a trader
// ---------------------------------------------------------------------------

export async function startComplianceAudit(traderId: string, reason: string) {
    const { staff, ...session } = await requireRRASession("compliance_officer");

    if (!reason?.trim()) throw new Error("A reason is required to start an audit.");

    // Check trader exists
    const [trader] = await db
        .select({ id: user.id, role: user.role })
        .from(user)
        .where(eq(user.id, traderId))
        .limit(1);

    if (!trader) throw new Error("Trader not found.");
    if (trader.role === "rra_staff") throw new Error("Cannot audit RRA staff.");

    await logAudit({
        userId: session.user.id,
        action: "AUDIT_OPENED",
        targetType: "user",
        targetId: traderId,
        metadata: {
            reason: reason.trim(),
            status: "open",
            openedBy: staff.staffId,
        },
    });

    return { success: true };
}

// ---------------------------------------------------------------------------
// Add a note to an ongoing audit
// ---------------------------------------------------------------------------

export async function addAuditNote(
    traderId: string,
    note: string,
    newStatus?: AuditStatus,
) {
    const { staff, ...session } = await requireRRASession("compliance_officer");

    if (!note?.trim()) throw new Error("Note cannot be empty.");

    const action =
        newStatus === "closed"
            ? "AUDIT_CLOSED"
            : newStatus === "in_progress"
                ? "AUDIT_PROGRESSED"
                : "AUDIT_NOTE_ADDED";

    await logAudit({
        userId: session.user.id,
        action,
        targetType: "user",
        targetId: traderId,
        metadata: {
            note: note.trim(),
            status: newStatus ?? "in_progress",
            updatedBy: staff.staffId,
        },
    });

    return { success: true };
}

// ---------------------------------------------------------------------------
// Flag suspicious activity on any entity
// ---------------------------------------------------------------------------

export async function flagSuspiciousActivity(
    targetId: string,
    targetType: string,
    reason: string,
    severity: "low" | "medium" | "high" | "critical",
) {
    const { staff, ...session } = await requireRRASession("compliance_officer");

    if (!reason?.trim()) throw new Error("A reason is required.");

    await logAudit({
        userId: session.user.id,
        action: "SUSPICIOUS_FLAGGED",
        targetType,
        targetId,
        metadata: {
            reason: reason.trim(),
            severity,
            flaggedBy: staff.staffId,
        },
    });

    return { success: true };
}

// ---------------------------------------------------------------------------
// Get audit history for a trader (timeline)
// ---------------------------------------------------------------------------

export async function getTraderAuditHistory(traderId: string) {
    await requireRRASession("compliance_officer");

    return db
        .select({
            id: auditLog.id,
            action: auditLog.action,
            userName: user.name,
            metadata: auditLog.metadata,
            createdAt: auditLog.createdAt,
        })
        .from(auditLog)
        .innerJoin(user, eq(auditLog.userId, user.id))
        .where(eq(auditLog.targetId, traderId))
        .orderBy(desc(auditLog.createdAt))
        .limit(50);
}

// ---------------------------------------------------------------------------
// Get all open/in-progress audits
// ---------------------------------------------------------------------------

export async function getActiveAudits() {
    await requireRRASession("compliance_officer");

    const auditEntries = await db
        .select({
            id: auditLog.id,
            action: auditLog.action,
            targetId: auditLog.targetId,
            metadata: auditLog.metadata,
            createdAt: auditLog.createdAt,
            staffName: user.name,
        })
        .from(auditLog)
        .innerJoin(user, eq(auditLog.userId, user.id))
        .where(
            sql`${auditLog.action} IN ('AUDIT_OPENED', 'AUDIT_PROGRESSED', 'AUDIT_NOTE_ADDED', 'AUDIT_CLOSED', 'SUSPICIOUS_FLAGGED')`,
        )
        .orderBy(desc(auditLog.createdAt))
        .limit(100);

    // Group by target to build audit timelines
    const auditMap = new Map<
        string,
        {
            targetId: string;
            latestStatus: string;
            latestAction: string;
            entries: typeof auditEntries;
            openedAt: Date;
        }
    >();

    for (const entry of auditEntries) {
        if (!entry.targetId) continue;
        const existing = auditMap.get(entry.targetId);
        const meta = entry.metadata as Record<string, unknown> | null;
        if (!existing) {
            auditMap.set(entry.targetId, {
                targetId: entry.targetId,
                latestStatus: (meta?.status as string) ?? "unknown",
                latestAction: entry.action,
                entries: [entry],
                openedAt: entry.createdAt,
            });
        } else {
            existing.entries.push(entry);
        }
    }

    // Get trader names
    const traderIds = [...auditMap.keys()];
    const traders =
        traderIds.length > 0
            ? await db
                .select({
                    id: user.id,
                    name: user.name,
                    businessName: user.businessName,
                })
                .from(user)
                .where(
                    sql`${user.id} IN (${sql.join(
                        traderIds.map((id) => sql`${id}`),
                        sql`, `,
                    )})`,
                )
            : [];

    const traderMap = new Map(
        traders.map((t) => [t.id, t.businessName ?? t.name]),
    );

    return [...auditMap.values()].map((a) => ({
        ...a,
        traderName: traderMap.get(a.targetId) ?? "Unknown",
    }));
}
