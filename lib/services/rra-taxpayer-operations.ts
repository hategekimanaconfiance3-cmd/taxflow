import { and, eq, inArray } from "drizzle-orm";
import type db from "@/db/drizzle";
import { notification, rraCase, rraCaseEvent, user } from "@/db/schema";
import { hasOperationalRRAPermission, type RRARole } from "@/lib/rra-rbac";
import { getAllowedClearanceTransitions, updateClearanceStatusSchema } from "@/lib/validation/admin-taxpayer.schema";
import { taxpayerInformationRequestSchema } from "@/lib/validation/rra-case.schema";
import type { logAudit } from "@/lib/audit";

type TaxflowTransaction = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];
type AuditEntry = Parameters<typeof logAudit>[0];
type AuditWriter = (entry: AuditEntry) => Promise<void>;

const TRADER_ROLES = ["manufacturer", "wholesaler", "retailer"] as const;

export interface RRAOperationActor {
  userId: string;
  staffRecordId: string;
  roles: RRARole[];
}

type OperationResult = { success: true } | { success: false; error: string };

export async function updateClearanceStatusInTransaction(
  tx: TaxflowTransaction,
  input: unknown,
  actor: RRAOperationActor,
  writeAudit: AuditWriter,
): Promise<OperationResult> {
  if (!hasOperationalRRAPermission(actor.roles, "taxpayer.clearance.update")) {
    return { success: false, error: "You do not have permission to change taxpayer clearance." };
  }
  const parsed = updateClearanceStatusSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Enter valid clearance details." };

  const [target] = await tx.select({ clearanceStatus: user.clearanceStatus }).from(user)
    .where(and(eq(user.id, parsed.data.traderId), inArray(user.role, [...TRADER_ROLES])))
    .for("update").limit(1);
  if (!target) return { success: false, error: "Taxpayer record not found." };
  if (!getAllowedClearanceTransitions(target.clearanceStatus).includes(parsed.data.status)) {
    return { success: false, error: "This clearance status change is not allowed from the taxpayer's current status." };
  }

  const [updated] = await tx.update(user).set({ clearanceStatus: parsed.data.status, updatedAt: new Date() })
    .where(and(eq(user.id, parsed.data.traderId), eq(user.clearanceStatus, target.clearanceStatus)))
    .returning({ id: user.id });
  if (!updated) return { success: false, error: "The taxpayer status changed while you were reviewing it. Refresh the record and try again." };

  await writeAudit({
    userId: actor.userId,
    action: "CLEARANCE_UPDATED",
    targetType: "user",
    targetId: parsed.data.traderId,
    beforeState: { clearanceStatus: target.clearanceStatus },
    afterState: { clearanceStatus: parsed.data.status },
    metadata: { reason: parsed.data.reason, updatedByStaffRecordId: actor.staffRecordId },
  });
  return { success: true };
}

export async function requestTaxpayerInformationInTransaction(
  tx: TaxflowTransaction,
  input: unknown,
  actor: RRAOperationActor,
  writeAudit: AuditWriter,
): Promise<OperationResult> {
  if (!hasOperationalRRAPermission(actor.roles, "compliance.followup.manage")) {
    return { success: false, error: "You do not have permission to request taxpayer follow-up." };
  }
  const parsed = taxpayerInformationRequestSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Enter valid request details." };

  const { caseId, requestType, details } = parsed.data;
  const eventType = requestType === "documents" ? "documents_requested" : "corrections_requested";
  const title = requestType === "documents" ? "RRA requested additional documents" : "RRA requested taxpayer corrections";
  const [current] = await tx.select({
    id: rraCase.id,
    traderId: rraCase.traderId,
    title: rraCase.title,
    status: rraCase.status,
  }).from(rraCase).where(eq(rraCase.id, caseId)).for("update").limit(1);
  if (!current) return { success: false, error: "Case not found." };
  if (current.status === "closed") return { success: false, error: "Closed cases cannot request more information." };

  const [taxpayer] = await tx.select({ id: user.id, role: user.role }).from(user)
    .where(and(eq(user.id, current.traderId), inArray(user.role, [...TRADER_ROLES]))).limit(1);
  if (!taxpayer) return { success: false, error: "Taxpayer record not found." };

  const now = new Date();
  const [updated] = await tx.update(rraCase).set({ status: "awaiting_information", updatedAt: now })
    .where(and(eq(rraCase.id, current.id), eq(rraCase.status, current.status)))
    .returning({ id: rraCase.id });
  if (!updated) return { success: false, error: "The case changed while you were preparing this request. Refresh and try again." };

  await tx.insert(rraCaseEvent).values({
    id: crypto.randomUUID(),
    caseId: current.id,
    actorStaffId: actor.staffRecordId,
    eventType,
    note: details,
    fromValue: current.status,
    toValue: "awaiting_information",
  });
  await tx.insert(notification).values({
    id: crypto.randomUUID(),
    userId: taxpayer.id,
    type: "rra_followup_request",
    title,
    message: `${details}\n\nRelated case: ${current.title}`,
    link: "/dashboard/notifications",
  });
  await writeAudit({
    userId: actor.userId,
    action: requestType === "documents" ? "RRA_DOCUMENTS_REQUESTED" : "RRA_CORRECTIONS_REQUESTED",
    targetType: "rra_case",
    targetId: current.id,
    beforeState: { status: current.status },
    afterState: { status: "awaiting_information", requestType },
    metadata: { taxpayerId: taxpayer.id, staffRecordId: actor.staffRecordId },
  });
  return { success: true };
}
