"use server";

import { eq } from "drizzle-orm";
import db from "@/db/drizzle";
import { user } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";

// ---------------------------------------------------------------------------
// Edit taxpayer information (admin-side)
// ---------------------------------------------------------------------------

export async function editTaxpayer(
    traderId: string,
    data: {
        name?: string;
        businessName?: string;
        phoneNumber?: string;
        email?: string;
    },
) {
    const { staff, ...session } = await requireRRASession("compliance_officer");

    // Validate at least one field provided
    const updates: Record<string, string | null> = {};

    if (data.name?.trim()) updates.name = data.name.trim();
    if (data.businessName !== undefined)
        updates.businessName = data.businessName.trim() || null;
    if (data.phoneNumber !== undefined)
        updates.phoneNumber = data.phoneNumber.trim() || null;
    if (data.email?.trim()) updates.email = data.email.trim();

    if (Object.keys(updates).length === 0) {
        throw new Error("No changes provided.");
    }

    // Get current values for audit
    const [current] = await db
        .select({
            name: user.name,
            businessName: user.businessName,
            phoneNumber: user.phoneNumber,
            email: user.email,
            role: user.role,
        })
        .from(user)
        .where(eq(user.id, traderId))
        .limit(1);

    if (!current) throw new Error("Trader not found.");
    if (current.role === "rra_staff")
        throw new Error("Cannot edit RRA staff via this action.");

    // Check email uniqueness if changing
    if (updates.email && updates.email !== current.email) {
        const [existingEmail] = await db
            .select({ id: user.id })
            .from(user)
            .where(eq(user.email, updates.email))
            .limit(1);
        if (existingEmail) throw new Error("Email already in use.");
    }

    // Check phone uniqueness if changing
    if (updates.phoneNumber && updates.phoneNumber !== current.phoneNumber) {
        const [existingPhone] = await db
            .select({ id: user.id })
            .from(user)
            .where(eq(user.phoneNumber, updates.phoneNumber))
            .limit(1);
        if (existingPhone) throw new Error("Phone number already in use.");
    }

    await db.update(user).set(updates).where(eq(user.id, traderId));

    await logAudit({
        userId: session.user.id,
        action: "TAXPAYER_EDITED",
        targetType: "user",
        targetId: traderId,
        metadata: {
            changes: updates,
            previous: {
                name: current.name,
                businessName: current.businessName,
                phoneNumber: current.phoneNumber,
                email: current.email,
            },
            editedBy: staff.staffId,
        },
    });

    return { success: true };
}
