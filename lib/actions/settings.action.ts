"use server";

import { eq } from "drizzle-orm";
import db from "@/db/drizzle";
import { user } from "@/db/schema";
import { requireTraderSession } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";

// ---------------------------------------------------------------------------
// Get Profile
// ---------------------------------------------------------------------------

export async function getProfile() {
    const session = await requireTraderSession();

    const [profile] = await db
        .select({
            id: user.id,
            name: user.name,
            businessName: user.businessName,
            tinNumber: user.tinNumber,
            phoneNumber: user.phoneNumber,
            email: user.email,
            role: user.role,
            clearanceStatus: user.clearanceStatus,
            createdAt: user.createdAt,
        })
        .from(user)
        .where(eq(user.id, session.user.id))
        .limit(1);

    if (!profile) {
        throw new Error("Profile not found");
    }

    return profile;
}

// ---------------------------------------------------------------------------
// Update Profile
// ---------------------------------------------------------------------------

export async function updateProfile(data: {
    name?: string;
    businessName?: string;
}) {
    const session = await requireTraderSession();

    const updates: Record<string, string> = {};

    if (data.name?.trim()) {
        updates.name = data.name.trim();
    }

    if (data.businessName?.trim()) {
        updates.businessName = data.businessName.trim();
    }

    if (Object.keys(updates).length === 0) {
        throw new Error("No changes provided");
    }

    await db
        .update(user)
        .set(updates)
        .where(eq(user.id, session.user.id));

    await logAudit({
        userId: session.user.id,
        action: "PROFILE_UPDATED",
        targetType: "user",
        targetId: session.user.id,
        metadata: updates,
    });

    return { success: true };
}
