"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import db from "@/db/drizzle";
import { auditLog, user } from "@/db/schema";
import { requireRRAOperationalPermission } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";
import { editTaxpayerSchema } from "@/lib/validation/admin-taxpayer.schema";

const TRADER_ROLES = ["manufacturer", "wholesaler", "retailer"] as const;
type EditTaxpayerResult = { success: true } | { success: false; error: string };

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

/** Update taxpayer profile fields with a permission check and atomic audit record. */
export async function editTaxpayer(input: unknown): Promise<EditTaxpayerResult> {
  const { staff, user: actor } = await requireRRAOperationalPermission("taxpayer.profile.update");
  const parsed = editTaxpayerSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Enter valid taxpayer details." };
  }

  const { traderId, ...data } = parsed.data;

  try {
    return await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          name: user.name,
          businessName: user.businessName,
          phoneNumber: user.phoneNumber,
          email: user.email,
        })
        .from(user)
        .where(and(eq(user.id, traderId), inArray(user.role, [...TRADER_ROLES])))
        .for("update")
        .limit(1);

      if (!current) return { success: false, error: "Taxpayer record not found." };

      const updates: Partial<Pick<typeof user.$inferInsert, "name" | "businessName" | "phoneNumber" | "email">> = {};
      if (data.name !== current.name) updates.name = data.name;
      if (data.businessName !== (current.businessName ?? "")) updates.businessName = data.businessName || null;
      if (data.phoneNumber !== (current.phoneNumber ?? "")) updates.phoneNumber = data.phoneNumber || null;
      if (data.email !== current.email) updates.email = data.email;
      const updatedFields = Object.keys(updates);

      if (updatedFields.length === 0) return { success: false, error: "No profile changes were provided." };

      if (updates.email) {
        const [existingEmail] = await tx.select({ id: user.id }).from(user)
          .where(and(eq(user.email, updates.email), ne(user.id, traderId))).limit(1);
        if (existingEmail) return { success: false, error: "That email address is already in use." };
      }

      if (updates.phoneNumber) {
        const [existingPhone] = await tx.select({ id: user.id }).from(user)
          .where(and(eq(user.phoneNumber, updates.phoneNumber), ne(user.id, traderId))).limit(1);
        if (existingPhone) return { success: false, error: "That phone number is already in use." };
      }

      await tx.update(user).set({ ...updates, updatedAt: new Date() }).where(eq(user.id, traderId));
      await logAudit({
        userId: actor.id,
        action: "TAXPAYER_EDITED",
        targetType: "user",
        targetId: traderId,
        metadata: { updatedFields, reason: data.reason, editedByStaffRecordId: staff.id },
      }, async (entry) => { await tx.insert(auditLog).values(entry); });

      return { success: true };
    });
  } catch (error) {
    console.error("Taxpayer profile update failed", {
      actorUserId: actor.id,
      targetId: traderId,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    if (isUniqueViolation(error)) {
      return { success: false, error: "The email or phone number is already in use." };
    }
    return { success: false, error: "Taxpayer details could not be saved. Please try again." };
  }
}
