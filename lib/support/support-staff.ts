import "server-only";

import { inArray, eq, and } from "drizzle-orm";
import db from "@/db/drizzle";
import { rraStaff, rraStaffRole, user } from "@/db/schema";
import { hasRRAPermission, isRRARole, type RRARole } from "@/lib/rra-rbac";

export type AuthorizedSupportStaff = {
  staffRecordId: string;
  userId: string;
  name: string;
  department: string | null;
  staffId: string;
};

/** Active RRA employees who have an effective role with support.manage. */
export async function getAuthorizedSupportStaff(): Promise<AuthorizedSupportStaff[]> {
  const staff = await db.select({
    staffRecordId: rraStaff.id,
    userId: user.id,
    name: user.name,
    department: rraStaff.department,
    staffId: rraStaff.staffId,
    clearanceLevel: rraStaff.clearanceLevel,
  }).from(rraStaff)
    .innerJoin(user, eq(rraStaff.userId, user.id))
    .where(and(eq(rraStaff.isActive, true), eq(user.isActive, true)));

  if (!staff.length) return [];
  const roles = await db.select({ staffRecordId: rraStaffRole.staffRecordId, role: rraStaffRole.role })
    .from(rraStaffRole)
    .where(inArray(rraStaffRole.staffRecordId, staff.map((row) => row.staffRecordId)));

  return staff.filter((employee) => {
    const assigned = roles.filter((role) => role.staffRecordId === employee.staffRecordId).map((role) => role.role);
    const effective = assigned.length ? assigned : [employee.clearanceLevel];
    return effective.some((role): role is RRARole => isRRARole(role) && hasRRAPermission(role, "support.manage"));
  }).map((employee) => ({
    staffRecordId: employee.staffRecordId,
    userId: employee.userId,
    name: employee.name,
    department: employee.department,
    staffId: employee.staffId,
  }));
}
