"use server";

import { eq, sql, and } from "drizzle-orm";
import db from "@/db/drizzle";
import { rraStaff, user } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Update staff clearance level
// ---------------------------------------------------------------------------

export async function updateStaffClearance(
    targetStaffId: string,
    newClearance: string,
) {
    const { staff, ...session } = await requireRRASession("super_admin");

    await db
        .update(rraStaff)
        .set({
            clearanceLevel: newClearance,
            updatedAt: new Date(),
        })
        .where(eq(rraStaff.id, targetStaffId));

    await logAudit({
        userId: session.user.id,
        action: "STAFF_CLEARANCE_UPDATED",
        targetType: "rra_staff",
        targetId: targetStaffId,
        metadata: { newClearance, updatedBy: staff.staffId },
    });

    return { success: true };
}

// ---------------------------------------------------------------------------
// Toggle staff active/inactive
// ---------------------------------------------------------------------------

export async function toggleStaffStatus(targetStaffId: string) {
    const { staff, ...session } = await requireRRASession("super_admin");

    const [target] = await db
        .select({ isActive: rraStaff.isActive })
        .from(rraStaff)
        .where(eq(rraStaff.id, targetStaffId))
        .limit(1);

    if (!target) throw new Error("Staff not found");

    const newStatus = !target.isActive;

    await db
        .update(rraStaff)
        .set({
            isActive: newStatus,
            updatedAt: new Date(),
        })
        .where(eq(rraStaff.id, targetStaffId));

    await logAudit({
        userId: session.user.id,
        action: newStatus ? "STAFF_ACTIVATED" : "STAFF_DEACTIVATED",
        targetType: "rra_staff",
        targetId: targetStaffId,
        metadata: { updatedBy: staff.staffId },
    });

    return { success: true, isActive: newStatus };
}

// ---------------------------------------------------------------------------
// Create new staff member (from existing user)
// ---------------------------------------------------------------------------

export async function createStaffMember(data: {
    userId: string;
    staffId: string;
    department: string;
    clearanceLevel: string;
}) {
    const { staff, ...session } = await requireRRASession("super_admin");

    // Check user exists
    const [existingUser] = await db
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(eq(user.id, data.userId))
        .limit(1);

    if (!existingUser) throw new Error("User not found");

    // Check staffId uniqueness
    const [existingStaff] = await db
        .select({ id: rraStaff.id })
        .from(rraStaff)
        .where(eq(rraStaff.staffId, data.staffId))
        .limit(1);

    if (existingStaff) throw new Error("Staff ID already in use");

    const id = randomUUID();

    await db.insert(rraStaff).values({
        id,
        userId: data.userId,
        staffId: data.staffId,
        department: data.department,
        clearanceLevel: data.clearanceLevel,
        assignedBy: staff.staffId,
        isActive: true,
    });

    await logAudit({
        userId: session.user.id,
        action: "STAFF_CREATED",
        targetType: "rra_staff",
        targetId: id,
        metadata: {
            staffId: data.staffId,
            clearanceLevel: data.clearanceLevel,
            createdBy: staff.staffId,
        },
    });

    return { success: true, id };
}

// ---------------------------------------------------------------------------
// Deactivate / soft-delete taxpayer
// ---------------------------------------------------------------------------

export async function deactivateTaxpayer(traderId: string) {
    const { staff, ...session } = await requireRRASession("super_admin");

    const [trader] = await db
        .select({ id: user.id, clearanceStatus: user.clearanceStatus })
        .from(user)
        .where(eq(user.id, traderId))
        .limit(1);

    if (!trader) throw new Error("Trader not found");

    await db
        .update(user)
        .set({
            clearanceStatus: "suspended",
            updatedAt: new Date(),
        })
        .where(eq(user.id, traderId));

    await logAudit({
        userId: session.user.id,
        action: "TAXPAYER_DEACTIVATED",
        targetType: "user",
        targetId: traderId,
        metadata: {
            previousStatus: trader.clearanceStatus,
            deactivatedBy: staff.staffId,
        },
    });

    return { success: true };
}

// ---------------------------------------------------------------------------
// Reactivate taxpayer
// ---------------------------------------------------------------------------

export async function reactivateTaxpayer(traderId: string) {
    const { staff, ...session } = await requireRRASession("super_admin");

    await db
        .update(user)
        .set({
            clearanceStatus: "approved",
            updatedAt: new Date(),
        })
        .where(eq(user.id, traderId));

    await logAudit({
        userId: session.user.id,
        action: "TAXPAYER_REACTIVATED",
        targetType: "user",
        targetId: traderId,
        metadata: { reactivatedBy: staff.staffId },
    });

    return { success: true };
}
