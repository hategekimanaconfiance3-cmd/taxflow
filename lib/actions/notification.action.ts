"use server";

import db from "@/db/drizzle";
import { notification } from "@/db/schema";
import { requireTraderSession } from "@/lib/auth-guard";
import { eq, desc, and, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Get notifications for current user
// ---------------------------------------------------------------------------

export async function getNotifications() {
    const session = await requireTraderSession();
    return db
        .select()
        .from(notification)
        .where(eq(notification.userId, session.user.id))
        .orderBy(desc(notification.createdAt))
        .limit(50);
}

// ---------------------------------------------------------------------------
// Get unread count
// ---------------------------------------------------------------------------

export async function getUnreadCount(): Promise<number> {
    const session = await requireTraderSession();
    const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notification)
        .where(
            and(
                eq(notification.userId, session.user.id),
                eq(notification.read, false),
            ),
        );
    return result?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Mark as read
// ---------------------------------------------------------------------------

export async function markNotificationRead(id: string) {
    const session = await requireTraderSession();
    await db
        .update(notification)
        .set({ read: true })
        .where(
            and(
                eq(notification.id, id),
                eq(notification.userId, session.user.id),
            ),
        );
}

// ---------------------------------------------------------------------------
// Mark all as read
// ---------------------------------------------------------------------------

export async function markAllNotificationsRead() {
    const session = await requireTraderSession();
    await db
        .update(notification)
        .set({ read: true })
        .where(
            and(
                eq(notification.userId, session.user.id),
                eq(notification.read, false),
            ),
        );
}
