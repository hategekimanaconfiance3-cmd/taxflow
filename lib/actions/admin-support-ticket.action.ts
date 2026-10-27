"use server";

import { eq, desc, sql } from "drizzle-orm";
import db from "@/db/drizzle";
import { supportTicket, user, rraStaff, rraStaffRole } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";

// ---------------------------------------------------------------------------
// Get all tickets (admin-facing, filterable by status)
// ---------------------------------------------------------------------------

export async function getAllTickets(status?: string) {
    await requireRRASession("compliance_officer", "audit_officer", "tax_compliance_officer", "audit_investigation_officer");

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

// ---------------------------------------------------------------------------
// Get a single ticket's full details (for admin detail panel)
// ---------------------------------------------------------------------------

export async function getTicketDetail(ticketId: string) {
    await requireRRASession("compliance_officer", "audit_officer", "tax_compliance_officer", "audit_investigation_officer");

    if (!ticketId?.trim()) throw new Error("Ticket ID is required.");

    const [ticket] = await db
        .select({
            id: supportTicket.id,
            traderId: supportTicket.traderId,
            traderName: user.businessName,
            traderEmail: user.email,
            traderTin: user.tinNumber,
            category: supportTicket.category,
            subject: supportTicket.subject,
            description: supportTicket.description,
            status: supportTicket.status,
            priority: supportTicket.priority,
            assignedToId: supportTicket.assignedToId,
            resolution: supportTicket.resolution,
            createdAt: supportTicket.createdAt,
            updatedAt: supportTicket.updatedAt,
            resolvedAt: supportTicket.resolvedAt,
        })
        .from(supportTicket)
        .innerJoin(user, eq(supportTicket.traderId, user.id))
        .where(eq(supportTicket.id, ticketId))
        .limit(1);

    if (!ticket) throw new Error("Ticket not found.");
    return ticket;
}

// ---------------------------------------------------------------------------
// Reopen a resolved or closed ticket
// ---------------------------------------------------------------------------

export async function reopenTicket(ticketId: string): Promise<{ success: true }> {
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
            status: "open",
            resolution: null,
            resolvedAt: null,
            updatedAt: new Date(),
        })
        .where(eq(supportTicket.id, ticketId));

    await logAudit({
        userId: session.user.id,
        action: "TICKET_REOPENED",
        targetType: "support_ticket",
        targetId: ticketId,
        metadata: { reopenedBy: staff.staffId },
    });

    await createNotification({
        userId: ticket.traderId,
        type: "ticket_update",
        title: "Support Ticket Reopened",
        message: `Your ticket "${ticket.subject}" has been reopened and is under review.`,
        link: "/dashboard/support",
    });

    return { success: true };
}

// ---------------------------------------------------------------------------
// Reply to a ticket (admin → trader notification; logged in audit trail)
// ---------------------------------------------------------------------------

export async function replyToTicket(
    ticketId: string,
    message: string,
): Promise<{ success: true }> {
    const { staff, ...session } = await requireRRASession("compliance_officer", "tax_compliance_officer");

    const trimmed = message?.trim();
    if (!trimmed || trimmed.length < 5) throw new Error("Reply message is too short (minimum 5 characters).");
    if (trimmed.length > 5000) throw new Error("Reply message is too long (maximum 5000 characters).");

    const [ticket] = await db
        .select()
        .from(supportTicket)
        .where(eq(supportTicket.id, ticketId))
        .limit(1);

    if (!ticket) throw new Error("Ticket not found.");

    // If ticket is open, move it to in_progress on first admin reply
    if (ticket.status === "open") {
        await db
            .update(supportTicket)
            .set({ status: "in_progress", updatedAt: new Date() })
            .where(eq(supportTicket.id, ticketId));
    }

    await logAudit({
        userId: session.user.id,
        action: "TICKET_REPLY_SENT",
        targetType: "support_ticket",
        targetId: ticketId,
        metadata: {
            repliedBy: staff.staffId,
            messageLength: trimmed.length,
        },
    });

    await createNotification({
        userId: ticket.traderId,
        type: "ticket_update",
        title: "New Reply on Your Support Ticket",
        message: `An RRA officer replied to your ticket "${ticket.subject}": ${trimmed.slice(0, 200)}${trimmed.length > 200 ? "…" : ""}`,
        link: "/dashboard/support",
    });

    return { success: true };
}

// ---------------------------------------------------------------------------
// Get list of active RRA staff for assignment dropdown
// ---------------------------------------------------------------------------

export async function getStaffList() {
    await requireRRASession("compliance_officer", "audit_officer", "tax_compliance_officer", "audit_investigation_officer");

    const rows = await db
        .select({
            userId: rraStaff.userId,
            staffId: rraStaff.staffId,
            department: rraStaff.department,
            name: user.name,
            role: rraStaff.clearanceLevel,
        })
        .from(rraStaff)
        .innerJoin(user, eq(rraStaff.userId, user.id))
        .where(eq(rraStaff.isActive, true))
        .orderBy(user.name);

    return rows;
}
