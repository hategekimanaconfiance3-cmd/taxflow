"use server";

import db from "@/db/drizzle";
import { notification } from "@/db/schema";
import { requireTraderSession } from "@/lib/auth-guard";
import { eq, desc, and, sql } from "drizzle-orm";
import { emitToUser } from "@/lib/realtime";

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
    const updated = await db
        .update(notification)
        .set({ read: true })
        .where(
            and(
                eq(notification.id, id),
                eq(notification.userId, session.user.id),
            ),
        )
        .returning({ id: notification.id });

    if (updated.length > 0) {
        emitToUser(session.user.id, "notification:count-refresh", {});
    }
}

// ---------------------------------------------------------------------------
// Mark all as read
// ---------------------------------------------------------------------------

export async function markAllNotificationsRead() {
    const session = await requireTraderSession();
    const updated = await db
        .update(notification)
        .set({ read: true })
        .where(
            and(
                eq(notification.userId, session.user.id),
                eq(notification.read, false),
            ),
        )
        .returning({ id: notification.id });

    if (updated.length > 0) {
        emitToUser(session.user.id, "notification:count-refresh", {});
    }
}
