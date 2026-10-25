"use server";

import { eq, desc, and, inArray } from "drizzle-orm";
import db from "@/db/drizzle";
import { auditLog, supportTicket, supportTicketMessage, user } from "@/db/schema";
import { requireTraderSession } from "@/lib/auth-guard";
import { z } from "zod";
import { createNotification } from "@/lib/notifications";

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

    const [ticket] = await db.transaction(async (tx) => {
        const [created] = await tx.insert(supportTicket).values({ traderId: session.user.id, category: data.category, subject, description }).returning({ id: supportTicket.id });
        if (!created) throw new Error("Support request could not be created.");
        await tx.insert(auditLog).values({ userId: session.user.id, action: "TICKET_CREATED", targetType: "support_ticket", targetId: created.id, metadata: JSON.stringify({ category: data.category, subject }) });
        return [created];
    });

    return { success: true, id: ticket.id };
}

// ---------------------------------------------------------------------------
// Get my tickets (trader-facing)
// ---------------------------------------------------------------------------

export async function getMyTickets() {
    const session = await requireTraderSession();
    const tickets = await db
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
    if (tickets.length === 0) return tickets.map((ticket) => ({ ...ticket, messages: [] }));
    const messages = await db.select({
        id: supportTicketMessage.id,
        ticketId: supportTicketMessage.ticketId,
        authorId: supportTicketMessage.authorId,
        authorName: user.name,
        body: supportTicketMessage.body,
        createdAt: supportTicketMessage.createdAt,
    }).from(supportTicketMessage).innerJoin(user, eq(supportTicketMessage.authorId, user.id))
        .where(inArray(supportTicketMessage.ticketId, tickets.map((ticket) => ticket.id)))
        .orderBy(supportTicketMessage.createdAt);
    return tickets.map((ticket) => ({ ...ticket, messages: messages.filter((message) => message.ticketId === ticket.id).map((message) => ({ ...message, authorType: message.authorId === session.user.id ? "You" : "RRA staff" })) }));
}

export async function replyToMyTicket(ticketId: string, body: string): Promise<{ success: true }> {
    const session = await requireTraderSession();
    const parsed = z.object({ ticketId: z.string().trim().min(1).max(128), body: z.string().trim().min(1).max(10_000) }).safeParse({ ticketId, body });
    if (!parsed.success) throw new Error("Enter a reply of up to 10,000 characters.");
    const ticketInfo = await db.transaction(async (tx) => {
        const [ticket] = await tx.select().from(supportTicket).where(and(eq(supportTicket.id, parsed.data.ticketId), eq(supportTicket.traderId, session.user.id))).limit(1).for("update");
        if (!ticket) throw new Error("Ticket not found.");
        if (ticket.status === "closed") throw new Error("This ticket is closed and cannot receive replies.");
        await tx.insert(supportTicketMessage).values({ ticketId: ticket.id, authorId: session.user.id, body: parsed.data.body });
        await tx.update(supportTicket).set({ updatedAt: new Date() }).where(eq(supportTicket.id, ticket.id));
        await tx.insert(auditLog).values({ userId: session.user.id, action: "TICKET_REPLIED", targetType: "support_ticket", targetId: ticket.id, metadata: JSON.stringify({ messageLength: parsed.data.body.length, authorType: "trader" }) });
        return { assignedToId: ticket.assignedToId, subject: ticket.subject };
    });
    if (ticketInfo.assignedToId) {
        try {
            await createNotification({ userId: ticketInfo.assignedToId, type: "ticket_update", title: "Trader replied to support ticket", message: `A trader replied to "${ticketInfo.subject}".`, link: "/admin/support" });
        } catch (error) {
            console.error("Support ticket notification failed", { errorName: error instanceof Error ? error.name : typeof error });
        }
    }
    return { success: true };
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
