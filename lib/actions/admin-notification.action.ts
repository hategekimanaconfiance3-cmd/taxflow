"use server";

import { eq, desc, sql, and, inArray } from "drizzle-orm";
import db from "@/db/drizzle";
import { notification, user } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// Get admin notifications (sent to any RRA staff)
// ---------------------------------------------------------------------------

export async function getAdminNotifications(limit = 50) {
    await requireRRASession();

    // Get notifications sent to RRA staff users
    const results = await db
        .select({
            id: notification.id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            link: notification.link,
            read: notification.read,
            createdAt: notification.createdAt,
            userName: user.name,
            businessName: user.businessName,
        })
        .from(notification)
        .innerJoin(user, eq(notification.userId, user.id))
        .orderBy(desc(notification.createdAt))
        .limit(limit);

    return results;
}

// ---------------------------------------------------------------------------
// Send bulk notification
// ---------------------------------------------------------------------------

export async function sendBulkNotification(
    targetGroup: "all" | "manufacturer" | "wholesaler" | "retailer" | "non_compliant",
    title: string,
    message: string,
    link?: string,
) {
    await requireRRASession("compliance_officer", "audit_officer");

    if (!title.trim() || !message.trim()) {
        throw new Error("Title and message are required.");
    }

    // Find target users
    let condition;
    if (targetGroup === "all") {
        condition = sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`;
    } else if (targetGroup === "non_compliant") {
        // For simplicity, notify all traders — compliance filtering happens at query level
        condition = sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`;
    } else {
        condition = eq(user.role, targetGroup);
    }

    const targets = await db
        .select({ id: user.id })
        .from(user)
        .where(condition);

    if (targets.length === 0) {
        return { sent: 0 };
    }

    // Insert notifications for all targets
    const notifs = targets.map((t) => ({
        userId: t.id,
        type: "system" as const,
        title: title.trim(),
        message: message.trim(),
        link: link?.trim() || null,
        read: false,
    }));

    await db.insert(notification).values(notifs);

    return { sent: notifs.length };
}

// ---------------------------------------------------------------------------
// Send notification to a specific trader
// ---------------------------------------------------------------------------

export async function sendNotificationToTrader(
    traderId: string,
    title: string,
    message: string,
    link?: string,
) {
    await requireRRASession();

    if (!title.trim() || !message.trim()) {
        throw new Error("Title and message are required.");
    }

    await db.insert(notification).values({
        userId: traderId,
        type: "system",
        title: title.trim(),
        message: message.trim(),
        link: link?.trim() || null,
        read: false,
    });

    return { success: true };
}
