"use server";

import { eq, desc, sql } from "drizzle-orm";
import db from "@/db/drizzle";
import { staffBulletin, user } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Bulletin = {
    id: string;
    authorId: string;
    authorName: string;
    title: string;
    content: string;
    priority: "info" | "important" | "urgent";
    department: string | null;
    createdAt: Date;
};

// ---------------------------------------------------------------------------
// Create a new bulletin
// ---------------------------------------------------------------------------

export async function createBulletin(data: {
    title: string;
    content: string;
    priority: "info" | "important" | "urgent";
    department?: string;
}): Promise<{ success: true; id: string }> {
    const { staff, ...session } = await requireRRASession("super_admin", "director_executive", "tax_compliance_officer", "audit_investigation_officer", "compliance_officer", "audit_officer");

    if (!data.title?.trim()) throw new Error("Title is required.");
    if (!data.content?.trim()) throw new Error("Content is required.");

    const [bulletin] = await db
        .insert(staffBulletin)
        .values({
            authorId: session.user.id,
            title: data.title.trim(),
            content: data.content.trim(),
            priority: data.priority,
            department: data.department?.trim() || null,
        })
        .returning({ id: staffBulletin.id });

    await logAudit({
        userId: session.user.id,
        action: "BULLETIN_CREATED",
        targetType: "staff_bulletin",
        targetId: bulletin.id,
        metadata: {
            title: data.title.trim(),
            priority: data.priority,
            department: data.department || "all",
        },
    });

    return { success: true, id: bulletin.id };
}

// ---------------------------------------------------------------------------
// Get bulletins (filtered by department, ordered by newest first)
// ---------------------------------------------------------------------------

export async function getBulletins(department?: string): Promise<Bulletin[]> {
    await requireRRASession();

    const whereClause = department
        ? sql`${staffBulletin.department} = ${department} OR ${staffBulletin.department} IS NULL`
        : sql`1 = 1`;

    const results = await db
        .select({
            id: staffBulletin.id,
            authorId: staffBulletin.authorId,
            authorName: user.name,
            title: staffBulletin.title,
            content: staffBulletin.content,
            priority: staffBulletin.priority,
            department: staffBulletin.department,
            createdAt: staffBulletin.createdAt,
        })
        .from(staffBulletin)
        .innerJoin(user, eq(staffBulletin.authorId, user.id))
        .where(whereClause)
        .orderBy(desc(staffBulletin.createdAt))
        .limit(50);

    return results as Bulletin[];
}

// ---------------------------------------------------------------------------
// Delete a bulletin (author or super_admin only)
// ---------------------------------------------------------------------------

export async function deleteBulletin(bulletinId: string): Promise<{ success: true }> {
    const { staff, ...session } = await requireRRASession();

    const [bulletin] = await db
        .select({ id: staffBulletin.id, authorId: staffBulletin.authorId })
        .from(staffBulletin)
        .where(eq(staffBulletin.id, bulletinId))
        .limit(1);

    if (!bulletin) throw new Error("Bulletin not found.");

    // Only author or super_admin can delete
    if (bulletin.authorId !== session.user.id && staff.clearanceLevel !== "super_admin") {
        throw new Error("You can only delete your own bulletins.");
    }

    await db
        .delete(staffBulletin)
        .where(eq(staffBulletin.id, bulletinId));

    await logAudit({
        userId: session.user.id,
        action: "BULLETIN_DELETED",
        targetType: "staff_bulletin",
        targetId: bulletinId,
        metadata: {},
    });

    return { success: true };
}
