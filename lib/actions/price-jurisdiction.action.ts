"use server";

import { and, eq } from "drizzle-orm";
import db from "@/db/drizzle";
import { auditLog, rraStaff, rraStaffJurisdiction } from "@/db/schema";
import { requireRRAPermission } from "@/lib/auth-guard";
import { priceJurisdictionSchema } from "@/lib/validation/price-monitoring.schema";

export type JurisdictionMutationResult = { success: true } | { success: false; error: string };

export async function setStaffPriceJurisdiction(staffRecordId: string, input: unknown): Promise<JurisdictionMutationResult> {
  const { user: actor } = await requireRRAPermission("price.jurisdiction.manage");
  const parsed = priceJurisdictionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Enter a valid jurisdiction." };
  try {
    await db.transaction(async (tx) => {
      const [staff] = await tx.select({ id: rraStaff.id, isActive: rraStaff.isActive }).from(rraStaff).where(eq(rraStaff.id, staffRecordId)).for("update").limit(1);
      if (!staff || !staff.isActive) throw new Error("Active staff member not found.");
      const [created] = await tx.insert(rraStaffJurisdiction).values({
        staffRecordId,
        scopeType: parsed.data.scopeType,
        province: parsed.data.province ?? null,
        district: parsed.data.district ?? null,
        assignedByUserId: actor.id,
      }).onConflictDoNothing().returning({ id: rraStaffJurisdiction.id });
      if (!created) throw new Error("This jurisdiction is already assigned.");
      await tx.insert(auditLog).values({ userId: actor.id, action: "PRICE_JURISDICTION_ASSIGNED", targetType: "rra_staff_jurisdiction", targetId: created.id,
        afterState: { staffRecordId, scopeType: parsed.data.scopeType, province: parsed.data.province ?? null, district: parsed.data.district ?? null },
        metadata: JSON.stringify({ reason: parsed.data.reason }) });
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Jurisdiction could not be assigned." };
  }
}

export async function removeStaffPriceJurisdiction(jurisdictionId: string, reason: string): Promise<JurisdictionMutationResult> {
  const { user: actor } = await requireRRAPermission("price.jurisdiction.manage");
  if (!reason.trim() || reason.trim().length < 5) return { success: false, error: "A reason of at least 5 characters is required." };
  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(rraStaffJurisdiction).where(eq(rraStaffJurisdiction.id, jurisdictionId)).for("update").limit(1);
      if (!existing) throw new Error("Jurisdiction assignment not found.");
      await tx.delete(rraStaffJurisdiction).where(and(eq(rraStaffJurisdiction.id, jurisdictionId), eq(rraStaffJurisdiction.staffRecordId, existing.staffRecordId)));
      await tx.insert(auditLog).values({ userId: actor.id, action: "PRICE_JURISDICTION_REMOVED", targetType: "rra_staff_jurisdiction", targetId: jurisdictionId,
        beforeState: { staffRecordId: existing.staffRecordId, scopeType: existing.scopeType, province: existing.province, district: existing.district },
        metadata: JSON.stringify({ reason: reason.trim() }) });
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Jurisdiction could not be removed." };
  }
}
