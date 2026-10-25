"use server";

import { eq, desc, sql } from "drizzle-orm";
import db from "@/db/drizzle";
import { supportTicket, user } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";

// ---------------------------------------------------------------------------
// Get all tickets (admin-facing, filterable by status)
// ---------------------------------------------------------------------------

export async function getAllTickets(status?: string) {
    await requireRRASession("compliance_officer", "audit_officer", "tax_compliance_officer", "audit_investigation_officer", "reporting_officer");

    const whereClause = status
        ? eq(supportTicket.status, status)
        : sql`1 = 1`;

    return db
        .select({
            id: supportTicket.id,
            traderName: user.businessName,
            traderId: supportTicket.traderId,
            category: supportTicket.category,
            subject: supportTicket.subject,
            status: supportTicket.status,
            priority: supportTicket.priority,
            createdAt: supportTicket.createdAt,
            resolvedAt: supportTicket.resolvedAt,
        })
        .from(supportTicket)
        .innerJoin(user, eq(supportTicket.traderId, user.id))
        .where(whereClause)
        .orderBy(desc(supportTicket.createdAt))
        .limit(100);
}

// ---------------------------------------------------------------------------
// Assign a ticket to an RRA staff member
// ---------------------------------------------------------------------------

export async function assignTicket(
    ticketId: string,
    staffUserId: string,
): Promise<{ success: true }> {
    const { staff, ...session } = await requireRRASession("compliance_officer", "tax_compliance_officer");

    const [ticket] = await db
        .select()
        .from(supportTicket)
        .where(eq(supportTicket.id, ticketId))
        .limit(1);

    if (!ticket) throw new Error("Ticket not found.");

    await db
        .update(supportTicket)
        .set({
            assignedToId: staffUserId,
            status: "in_progress",
            updatedAt: new Date(),
        })
        .where(eq(supportTicket.id, ticketId));

    await logAudit({
        userId: session.user.id,
        action: "TICKET_ASSIGNED",
        targetType: "support_ticket",
        targetId: ticketId,
        metadata: {
            assignedTo: staffUserId,
            assignedBy: staff.staffId,
        },
    });

    // Notify the trader
    await createNotification({
        userId: ticket.traderId,
        type: "ticket_update",
        title: "Support Ticket Update",
        message: `Your ticket "${ticket.subject}" has been assigned to a staff member and is being reviewed.`,
        link: "/dashboard/support",
    });

    return { success: true };
}

// ---------------------------------------------------------------------------
// Resolve a ticket
// ---------------------------------------------------------------------------

export async function resolveTicket(
    ticketId: string,
    resolution: string,
): Promise<{ success: true }> {
    const { staff, ...session } = await requireRRASession("compliance_officer", "tax_compliance_officer");

    if (!resolution?.trim()) throw new Error("Resolution is required.");

    const [ticket] = await db
        .select()
        .from(supportTicket)
        .where(eq(supportTicket.id, ticketId))
        .limit(1);

    if (!ticket) throw new Error("Ticket not found.");

    await db
        .update(supportTicket)
        .set({
            status: "resolved",
            resolution: resolution.trim(),
            resolvedAt: new Date(),
            updatedAt: new Date(),
        })
        .where(eq(supportTicket.id, ticketId));

    await logAudit({
        userId: session.user.id,
        action: "TICKET_RESOLVED",
        targetType: "support_ticket",
        targetId: ticketId,
        metadata: {
            resolution: resolution.trim(),
            resolvedBy: staff.staffId,
        },
    });

    // Notify the trader
    await createNotification({
        userId: ticket.traderId,
        type: "ticket_update",
        title: "Support Ticket Resolved",
        message: `Your ticket "${ticket.subject}" has been resolved: ${resolution.trim()}`,
        link: "/dashboard/support",
    });

    return { success: true };
}

// ---------------------------------------------------------------------------
// Get ticket statistics for admin dashboard
// ---------------------------------------------------------------------------

export async function getTicketStats() {
    await requireRRASession("compliance_officer", "audit_officer", "tax_compliance_officer", "audit_investigation_officer");

    const [stats] = await db
        .select({
            total: sql<number>`COUNT(*)::int`.as("total"),
            open: sql<number>`COUNT(*) FILTER (WHERE ${supportTicket.status} = 'open')::int`.as("open"),
            inProgress: sql<number>`COUNT(*) FILTER (WHERE ${supportTicket.status} = 'in_progress')::int`.as("in_progress"),
            resolved: sql<number>`COUNT(*) FILTER (WHERE ${supportTicket.status} = 'resolved')::int`.as("resolved"),
            closed: sql<number>`COUNT(*) FILTER (WHERE ${supportTicket.status} = 'closed')::int`.as("closed"),
        })
        .from(supportTicket);

    return {
        total: stats?.total || 0,
        open: stats?.open || 0,
        inProgress: stats?.inProgress || 0,
        resolved: stats?.resolved || 0,
        closed: stats?.closed || 0,
    };
}
