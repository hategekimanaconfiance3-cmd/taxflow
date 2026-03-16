"use server";

import db from "@/db/drizzle";
import { notification } from "@/db/schema";
import { requireTraderSession } from "@/lib/auth-guard";
import { eq, desc, and, sql } from "drizzle-orm";
import { emitToUser } from "@/lib/realtime";

// ---------------------------------------------------------------------------
// Create a notification
// ---------------------------------------------------------------------------

export async function createNotification(data: {
    userId: string;
    type: string;
    title: string;
    message: string;
    link?: string;
}) {
    const [notif] = await db
        .insert(notification)
        .values({
            userId: data.userId,
            type: data.type,
            title: data.title,
            message: data.message,
            link: data.link ?? null,
        })
        .returning();

    // Real-time push
    emitToUser(data.userId, "notification", {
        id: notif.id,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        link: notif.link,
    });

    return notif;
}

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
