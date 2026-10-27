"use server";

import { eq, desc, and } from "drizzle-orm";
import db from "@/db/drizzle";
import { supportTicket, user } from "@/db/schema";
import { requireTraderSession } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";

// ---------------------------------------------------------------------------
// Create a support ticket (trader-facing)
// ---------------------------------------------------------------------------

export async function createTicket(data: {
    category: "general" | "tax_query" | "account_issue" | "system_bug" | "other";
    subject: string;
    description: string;
}): Promise<{ success: true; id: string }> {
    const session = await requireTraderSession();

    const categories = ["general", "tax_query", "account_issue", "system_bug", "other"];
    if (!categories.includes(data.category)) throw new Error("Choose a valid ticket category.");

    const subject = data.subject?.trim();
    const description = data.description?.trim();
    if (!subject) throw new Error("Subject is required.");
    if (subject.length > 200) throw new Error("Subject must be 200 characters or fewer.");
    if (!description) throw new Error("Description is required.");
    if (description.length > 10_000) throw new Error("Description must be 10,000 characters or fewer.");

    const [ticket] = await db
        .insert(supportTicket)
        .values({
            traderId: session.user.id,
            category: data.category,
            subject,
            description,
        })
        .returning({ id: supportTicket.id });

    await logAudit({
        userId: session.user.id,
        action: "TICKET_CREATED",
        targetType: "support_ticket",
        targetId: ticket.id,
        metadata: {
            category: data.category,
            subject,
        },
    });

    return { success: true, id: ticket.id };
}

// ---------------------------------------------------------------------------
// Get my tickets (trader-facing)
// ---------------------------------------------------------------------------

export async function getMyTickets() {
    const session = await requireTraderSession();

    return db
        .select({
            id: supportTicket.id,
            category: supportTicket.category,
            subject: supportTicket.subject,
            description: supportTicket.description,
            status: supportTicket.status,
            priority: supportTicket.priority,
            resolution: supportTicket.resolution,
            createdAt: supportTicket.createdAt,
            resolvedAt: supportTicket.resolvedAt,
        })
        .from(supportTicket)
        .where(eq(supportTicket.traderId, session.user.id))
        .orderBy(desc(supportTicket.createdAt));
}

// ---------------------------------------------------------------------------
// Get a single ticket (trader-facing — only own tickets)
// ---------------------------------------------------------------------------

export async function getTicket(ticketId: string) {
    const session = await requireTraderSession();

    const [ticket] = await db
        .select({
            id: supportTicket.id,
            category: supportTicket.category,
            subject: supportTicket.subject,
            description: supportTicket.description,
            status: supportTicket.status,
            priority: supportTicket.priority,
            resolution: supportTicket.resolution,
            assignedToName: user.name,
            createdAt: supportTicket.createdAt,
            updatedAt: supportTicket.updatedAt,
            resolvedAt: supportTicket.resolvedAt,
        })
        .from(supportTicket)
        .leftJoin(user, eq(supportTicket.assignedToId, user.id))
        .where(
            and(
                eq(supportTicket.id, ticketId),
                eq(supportTicket.traderId, session.user.id),
            ),
        )
        .limit(1);

    if (!ticket) throw new Error("Ticket not found.");

    return ticket;
}
