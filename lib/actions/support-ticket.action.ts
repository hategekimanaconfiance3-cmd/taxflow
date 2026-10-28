"use server";

import { eq, desc, and } from "drizzle-orm";
import db from "@/db/drizzle";
import { supportTicket, user } from "@/db/schema";
import { requireTraderSession } from "@/lib/auth-guard";
import { createTaxpayerConversation } from "@/lib/actions/messaging.action";

// ---------------------------------------------------------------------------
// Create a support ticket (trader-facing)
// ---------------------------------------------------------------------------

export async function createTicket(data: {
    category: "general" | "tax_query" | "account_issue" | "system_bug" | "other";
    subject: string;
    description: string;
}): Promise<{ success: true; id: string }> {
    await requireTraderSession();
    const categoryMap = {
        general: 'general',
        tax_query: 'tax_declaration',
        account_issue: 'account_access',
        system_bug: 'account_access',
        other: 'general',
    } as const;
    const category = categoryMap[data.category];
    if (!category) throw new Error('Choose a valid ticket category.');
    return createTaxpayerConversation({
        category,
        subject: data.subject,
        body: data.description,
        clientMessageId: crypto.randomUUID(),
    });
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
