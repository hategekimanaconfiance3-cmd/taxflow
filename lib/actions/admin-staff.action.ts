"use server";

import { eq, sql, and, inArray } from "drizzle-orm";
import db from "@/db/drizzle";
import { account, auditLog, rraStaff, session as authSession, user } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
import {
    resetStaffPasswordSchema,
    staffAssignmentRoleSchema,
    staffAccountSchema,
} from "@/lib/validation/staff.schema";

type StaffMutationResult =
    | { success: true }
    | { success: false; error: string; fieldErrors?: Record<string, string> };

function isUniqueViolation(error: unknown): { constraint: string } | null {
    if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "23505") {
        return null;
    }

    const constraint = "constraint" in error && typeof error.constraint === "string" ? error.constraint : "";
    return { constraint };
}

async function lockActiveSuperAdmins(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) {
    return tx
        .select({ id: rraStaff.id })
        .from(rraStaff)
        .where(and(eq(rraStaff.clearanceLevel, "super_admin"), eq(rraStaff.isActive, true)))
        .for("update");
}

// ---------------------------------------------------------------------------
// Update staff clearance level
// ---------------------------------------------------------------------------

export async function updateStaffClearance(
    targetStaffId: string,
    newClearance: string,
): Promise<StaffMutationResult> {
    const { staff, ...session } = await requireRRASession("super_admin");
    const parsedRole = staffAssignmentRoleSchema.safeParse(newClearance);
    if (!parsedRole.success) return { success: false, error: "Choose a valid staff role." };

    try {
        await db.transaction(async (tx) => {
            const [target] = await tx
                .select({ clearanceLevel: rraStaff.clearanceLevel, isActive: rraStaff.isActive })
                .from(rraStaff)
                .where(eq(rraStaff.id, targetStaffId))
                .for("update")
                .limit(1);
            if (!target) throw new Error("Staff member not found.");

            if (target.isActive && target.clearanceLevel === "super_admin" && parsedRole.data !== "super_admin") {
                const activeAdmins = await lockActiveSuperAdmins(tx);
                if (activeAdmins.length <= 1) throw new Error("The last active Super Admin cannot be demoted.");
            }

            await tx
                .update(rraStaff)
                .set({ clearanceLevel: parsedRole.data, updatedAt: new Date() })
                .where(eq(rraStaff.id, targetStaffId));
            await logAudit(
                {
                    userId: session.user.id,
                    action: "STAFF_CLEARANCE_UPDATED",
                    targetType: "rra_staff",
                    targetId: targetStaffId,
                    beforeState: { clearanceLevel: target.clearanceLevel },
                    afterState: { clearanceLevel: parsedRole.data },
                    metadata: { updatedBy: staff.staffId },
                },
                async (entry) => { await tx.insert(auditLog).values(entry); },
            );
        });
        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Staff role could not be updated.";
        console.error("Staff role update failed.");
        return { success: false, error: message };
    }
}

// ---------------------------------------------------------------------------
// Toggle staff active/inactive
// ---------------------------------------------------------------------------

export async function toggleStaffStatus(targetStaffId: string): Promise<StaffMutationResult & { isActive?: boolean }> {
    const { staff, ...session } = await requireRRASession("super_admin");

    try {
        const isActive = await db.transaction(async (tx) => {
            const [target] = await tx
                .select({ isActive: rraStaff.isActive, clearanceLevel: rraStaff.clearanceLevel })
                .from(rraStaff)
                .where(eq(rraStaff.id, targetStaffId))
                .for("update")
                .limit(1);
            if (!target) throw new Error("Staff member not found.");

            const newStatus = !target.isActive;
            if (!newStatus && target.clearanceLevel === "super_admin") {
                const activeAdmins = await lockActiveSuperAdmins(tx);
                if (activeAdmins.length <= 1) throw new Error("The last active Super Admin cannot be deactivated.");
            }

            await tx
                .update(rraStaff)
                .set({ isActive: newStatus, updatedAt: new Date() })
                .where(eq(rraStaff.id, targetStaffId));
            await logAudit(
                {
                    userId: session.user.id,
                    action: newStatus ? "STAFF_ACTIVATED" : "STAFF_DEACTIVATED",
                    targetType: "rra_staff",
                    targetId: targetStaffId,
                    beforeState: { isActive: target.isActive },
                    afterState: { isActive: newStatus },
                    metadata: { updatedBy: staff.staffId },
                },
                async (entry) => { await tx.insert(auditLog).values(entry); },
            );
            return newStatus;
        });
        return { success: true, isActive };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Staff status could not be changed.";
        console.error("Staff status change failed.");
        return { success: false, error: message };
    }
}

export async function createStaffAccount(data: unknown): Promise<
    | { success: true; staffId: string }
    | { success: false; error: string; fieldErrors?: Record<string, string> }
> {
    const { staff, ...session } = await requireRRASession("super_admin");
    const parsed = staffAccountSchema.safeParse(data);
    if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const [field, errors] of Object.entries(parsed.error.flatten().fieldErrors)) {
            if (errors?.[0]) fieldErrors[field] = errors[0];
        }
        return { success: false, error: "Review the highlighted fields.", fieldErrors };
    }

    const staffId = parsed.data.staffId.toUpperCase();
    const email = parsed.data.email.toLowerCase();
    const username = staffId.toLowerCase();
    const userId = randomUUID();
    const staffRecordId = randomUUID();

    try {
        const passwordHash = await hashPassword(parsed.data.password);
        await db.transaction(async (tx) => {
            const [duplicateStaff] = await tx
                .select({ id: rraStaff.id })
                .from(rraStaff)
                .where(sql`lower(${rraStaff.staffId}) = ${username}`)
                .limit(1);
            if (duplicateStaff) throw new Error("STAFF_ID_DUPLICATE");

            const [duplicateUsername] = await tx
                .select({ id: user.id })
                .from(user)
                .where(sql`lower(${user.username}) = ${username}`)
                .limit(1);
            if (duplicateUsername) throw new Error("STAFF_ID_DUPLICATE");

            const [duplicateEmail] = await tx
                .select({ id: user.id })
                .from(user)
                .where(sql`lower(${user.email}) = ${email}`)
                .limit(1);
            if (duplicateEmail) throw new Error("EMAIL_DUPLICATE");

            await tx.insert(user).values({
                id: userId,
                name: parsed.data.fullName,
                username,
                displayUsername: staffId,
                email,
                emailVerified: true,
                role: "rra_staff",
                isActive: true,
            });
            await tx.insert(account).values({
                id: randomUUID(),
                accountId: userId,
                providerId: "credential",
                userId,
                password: passwordHash,
            });
            await tx.insert(rraStaff).values({
                id: staffRecordId,
                userId,
                staffId,
                department: parsed.data.department,
                clearanceLevel: staffAssignmentRoleSchema.parse(parsed.data.clearanceLevel),
                assignedBy: session.user.id,
                isActive: true,
            });
            await logAudit(
                {
                    userId: session.user.id,
                    action: "STAFF_CREATED",
                    targetType: "rra_staff",
                    targetId: staffRecordId,
                    metadata: {
                        staffId,
                        department: parsed.data.department,
                        clearanceLevel: parsed.data.clearanceLevel,
                        createdBy: staff.staffId,
                    },
                },
                async (entry) => { await tx.insert(auditLog).values(entry); },
            );
        });

        return { success: true, staffId };
    } catch (error) {
        const uniqueViolation = isUniqueViolation(error);
        if (error instanceof Error && error.message === "STAFF_ID_DUPLICATE") {
            return { success: false, error: "That Staff ID is already in use.", fieldErrors: { staffId: "That Staff ID is already in use." } };
        }
        if (error instanceof Error && error.message === "EMAIL_DUPLICATE") {
            return { success: false, error: "That email address is already in use.", fieldErrors: { email: "That email address is already in use." } };
        }
        if (uniqueViolation) {
            if (uniqueViolation.constraint.includes("staff_id") || uniqueViolation.constraint.includes("username")) {
                return { success: false, error: "That Staff ID is already in use.", fieldErrors: { staffId: "That Staff ID is already in use." } };
            }
            if (uniqueViolation.constraint.includes("email")) {
                return { success: false, error: "That email address is already in use.", fieldErrors: { email: "That email address is already in use." } };
            }
        }
        console.error("Staff account creation failed.");
        return { success: false, error: "The staff account could not be created. Please try again." };
    }
}

export async function resetStaffPassword(data: unknown): Promise<StaffMutationResult> {
    const { staff, ...session } = await requireRRASession("super_admin");
    const parsed = resetStaffPasswordSchema.safeParse(data);
    if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const [field, errors] of Object.entries(parsed.error.flatten().fieldErrors)) {
            if (errors?.[0]) fieldErrors[field] = errors[0];
        }
        return { success: false, error: "Review the password fields.", fieldErrors };
    }

    try {
        const passwordHash = await hashPassword(parsed.data.password);
        await db.transaction(async (tx) => {
            const [target] = await tx
                .select({ id: rraStaff.id, userId: rraStaff.userId, staffId: rraStaff.staffId })
                .from(rraStaff)
                .where(eq(rraStaff.id, parsed.data.staffRecordId))
                .for("update")
                .limit(1);
            if (!target) throw new Error("STAFF_NOT_FOUND");

            const [credential] = await tx
                .select({ id: account.id })
                .from(account)
                .where(and(eq(account.userId, target.userId), eq(account.providerId, "credential")))
                .limit(1);
            if (!credential) throw new Error("CREDENTIAL_NOT_FOUND");

            await tx.update(account).set({ password: passwordHash }).where(eq(account.id, credential.id));
            await tx.delete(authSession).where(eq(authSession.userId, target.userId));
            await logAudit(
                {
                    userId: session.user.id,
                    action: "STAFF_PASSWORD_RESET",
                    targetType: "rra_staff",
                    targetId: target.id,
                    metadata: { staffId: target.staffId, resetBy: staff.staffId },
                },
                async (entry) => { await tx.insert(auditLog).values(entry); },
            );
        });
        return { success: true };
    } catch (error) {
        if (error instanceof Error && error.message === "STAFF_NOT_FOUND") {
            return { success: false, error: "Staff member not found." };
        }
        if (error instanceof Error && error.message === "CREDENTIAL_NOT_FOUND") {
            return { success: false, error: "This staff member has no credential login to reset." };
        }
        console.error("Staff password reset failed.");
        return { success: false, error: "The password could not be reset. Please try again." };
    }
}

// ---------------------------------------------------------------------------
// Create new staff member (from existing user)
// ---------------------------------------------------------------------------

export async function createStaffMember(data: {
    userId: string;
    staffId: string;
    department: string;
    clearanceLevel: string;
}): Promise<{ success: true; id: string }> {
    const { staff, ...session } = await requireRRASession("super_admin");
    const parsedRole = staffAssignmentRoleSchema.safeParse(data.clearanceLevel);
    const staffId = data.staffId.trim().toUpperCase();
    const department = data.department.trim();
    if (!parsedRole.success || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(staffId) || !department) {
        throw new Error("Invalid staff details.");
    }
    const id = randomUUID();
    await db.transaction(async (tx) => {
        const [existingUser] = await tx
            .select({ id: user.id })
            .from(user)
            .where(eq(user.id, data.userId))
            .limit(1);
        if (!existingUser) throw new Error("User not found.");

        const [existingStaff] = await tx
            .select({ id: rraStaff.id })
            .from(rraStaff)
            .where(sql`lower(${rraStaff.staffId}) = ${staffId.toLowerCase()}`)
            .limit(1);
        if (existingStaff) throw new Error("Staff ID already in use.");

        await tx.insert(rraStaff).values({
            id,
            userId: data.userId,
            staffId,
            department,
            clearanceLevel: parsedRole.data,
            assignedBy: session.user.id,
            isActive: true,
        });
        await logAudit(
            {
                userId: session.user.id,
                action: "STAFF_CREATED",
                targetType: "rra_staff",
                targetId: id,
                metadata: { staffId, clearanceLevel: parsedRole.data, createdBy: staff.staffId },
            },
            async (entry) => { await tx.insert(auditLog).values(entry); },
        );
    });

    return { success: true, id };
}

// ---------------------------------------------------------------------------
// Deactivate / soft-delete taxpayer
// ---------------------------------------------------------------------------

export async function deactivateTaxpayer(traderId: string) {
    const session = await requireRRASession("compliance_officer");
    await db.transaction(async (tx) => {
        const [trader] = await tx
            .select({ id: user.id, clearanceStatus: user.clearanceStatus })
            .from(user)
            .where(and(eq(user.id, traderId), inArray(user.role, ["manufacturer", "wholesaler", "retailer"])))
            .for("update")
            .limit(1);
        if (!trader) throw new Error("Trader not found");

        await tx.update(user).set({ clearanceStatus: "suspended", updatedAt: new Date() }).where(eq(user.id, traderId));
        await logAudit({
            userId: session.user.id,
            action: "TAXPAYER_DEACTIVATED",
            targetType: "user",
            targetId: traderId,
            beforeState: { clearanceStatus: trader.clearanceStatus },
            afterState: { clearanceStatus: "suspended" },
        }, async (entry) => { await tx.insert(auditLog).values(entry); });
    });

    return { success: true };
}

// ---------------------------------------------------------------------------
// Reactivate taxpayer
// ---------------------------------------------------------------------------

export async function reactivateTaxpayer(traderId: string) {
    const session = await requireRRASession("compliance_officer");
    await db.transaction(async (tx) => {
        const [trader] = await tx
            .select({ id: user.id, clearanceStatus: user.clearanceStatus })
            .from(user)
            .where(and(eq(user.id, traderId), inArray(user.role, ["manufacturer", "wholesaler", "retailer"])))
            .for("update")
            .limit(1);
        if (!trader) throw new Error("Trader not found");

        await tx.update(user).set({ clearanceStatus: "approved", updatedAt: new Date() }).where(eq(user.id, traderId));
        await logAudit({
            userId: session.user.id,
            action: "TAXPAYER_REACTIVATED",
            targetType: "user",
            targetId: traderId,
            beforeState: { clearanceStatus: trader.clearanceStatus },
            afterState: { clearanceStatus: "approved" },
        }, async (entry) => { await tx.insert(auditLog).values(entry); });
    });

    return { success: true };
}
