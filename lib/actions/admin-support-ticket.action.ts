"use server";

import { eq, desc, sql, and } from "drizzle-orm";
import db from "@/db/drizzle";
import { supportTicket, user } from "@/db/schema";
import { requireRRAOperationalPermission } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";

// ---------------------------------------------------------------------------
// Get all tickets (admin-facing, filterable by status)
// ---------------------------------------------------------------------------

export async function getAllTickets(status?: string, tin?: string) {
    await requireRRAOperationalPermission("support.manage");

    if (tin && (tin.trim().length < 5 || tin.trim().length > 32 || !/^[A-Za-z0-9-]+$/.test(tin.trim()))) {
        throw new Error("Enter a valid TIN to filter support tickets.");
    }
    const conditions = [];
    if (status) conditions.push(eq(supportTicket.status, status));
    if (tin) conditions.push(eq(user.tinNumber, tin.trim()));
    const whereClause = conditions.length ? and(...conditions) : sql`1 = 1`;

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
    const { staff, ...session } = await requireRRAOperationalPermission("support.manage");

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
    const { staff, ...session } = await requireRRAOperationalPermission("support.manage");

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
    await requireRRAOperationalPermission("support.manage");

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
