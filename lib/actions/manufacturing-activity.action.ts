"use server";

import { and, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import db from "@/db/drizzle";
import { auditLog, b2bDispatch, b2bOrderAcceptance, b2bReceipt, importDeclaration, productionBatch, product, session, stockMovement, transaction, user } from "@/db/schema";
import { requireRRAPermission } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";
import type {
  ManufacturerActivityEvent,
  ManufacturerActivityTarget,
  ManufacturerActivityView,
  ManufacturingActivityResult,
} from "@/lib/manufacturing-activity.types";

const manufacturerSearchSchema = z.object({
  search: z.string().trim().max(120).default(""),
});

const manufacturerIdSchema = z.object({
  manufacturerId: z.string().trim().min(1).max(128),
});

const profileEditSchema = z.object({
  manufacturerId: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(120),
  businessName: z.string().trim().max(160),
  reason: z.string().trim().min(10).max(500),
});

const accountStatusSchema = z.object({
  manufacturerId: z.string().trim().min(1).max(128),
  status: z.enum(["under_review", "suspended", "restore"]),
  reason: z.string().trim().min(10).max(500),
});

type ProfileEditInput = z.infer<typeof profileEditSchema>;
type AccountStatusInput = z.infer<typeof accountStatusSchema>;

function reportFailure(operation: string, error: unknown): void {
  console.error("[manufacturing-activity] operation failed", {
    operation,
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
}

function parseAuditMetadata(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

/** Search manufacturers using only the limited profile fields needed by this workspace. */
export async function searchManufacturersForActivity(
  input: unknown,
): Promise<ManufacturingActivityResult<ManufacturerActivityTarget[]>> {
  await requireRRAPermission("taxpayer.activity.read");
  const parsed = manufacturerSearchSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Enter a valid manufacturer search." };

  try {
    const search = parsed.data.search;
    const conditions: SQL[] = [eq(user.role, "manufacturer")];
    if (search) {
      conditions.push(or(ilike(user.name, `%${search}%`), ilike(user.businessName, `%${search}%`))!);
    }

    const rows = await db
      .select({
        id: user.id,
        name: user.name,
        businessName: user.businessName,
        clearanceStatus: user.clearanceStatus,
        isActive: user.isActive,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(and(...conditions))
      .orderBy(desc(user.createdAt))
      .limit(100);

    return { success: true, data: rows };
  } catch (error) {
    reportFailure("search", error);
    return { success: false, error: "Manufacturer records could not be loaded." };
  }
}

/** Load a restricted operational activity timeline for one manufacturer. */
export async function getManufacturerActivity(
  input: unknown,
): Promise<ManufacturingActivityResult<ManufacturerActivityView>> {
  await requireRRAPermission("taxpayer.activity.read");
  const parsed = manufacturerIdSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Select a valid manufacturer." };

  try {
    const [manufacturerRow] = await db
      .select({
        id: user.id,
        name: user.name,
        businessName: user.businessName,
        clearanceStatus: user.clearanceStatus,
        isActive: user.isActive,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(and(eq(user.id, parsed.data.manufacturerId), eq(user.role, "manufacturer")))
      .limit(1);

    if (!manufacturerRow) return { success: false, error: "Manufacturer was not found." };

    const manufacturer = manufacturerRow;
    const [batches, sales, imports, movements, acceptances, dispatches, receipts, accountEvents] = await Promise.all([
      db
        .select({
          productName: product.name,
          declaredQuantity: productionBatch.declaredQuantity,
          reportedGoodOutputQuantity: productionBatch.reportedGoodOutputQuantity,
          goodOutputQuantity: productionBatch.goodOutputQuantity,
          status: productionBatch.status,
          occurredAt: productionBatch.createdAt,
        })
        .from(productionBatch)
        .innerJoin(product, eq(product.id, productionBatch.productId))
        .where(eq(productionBatch.manufacturerId, manufacturer.id))
        .orderBy(desc(productionBatch.createdAt))
        .limit(100),
      db
        .select({
          productName: product.name,
          quantity: transaction.quantity,
          status: transaction.status,
          occurredAt: transaction.createdAt,
        })
        .from(transaction)
        .innerJoin(product, eq(product.id, transaction.productId))
        .where(eq(transaction.sellerId, manufacturer.id))
        .orderBy(desc(transaction.createdAt))
        .limit(100),
      db
        .select({
          productName: product.name,
          expectedQuantity: importDeclaration.expectedQuantity,
          inspectedQuantity: importDeclaration.inspectedQuantity,
          status: importDeclaration.status,
          occurredAt: importDeclaration.createdAt,
        })
        .from(importDeclaration)
        .innerJoin(product, eq(product.id, importDeclaration.productId))
        .where(eq(importDeclaration.businessId, manufacturer.id))
        .orderBy(desc(importDeclaration.createdAt))
        .limit(100),
      db
        .select({
          productName: product.name,
          quantityDelta: stockMovement.quantityDelta,
          movementType: stockMovement.movementType,
          occurredAt: stockMovement.createdAt,
        })
        .from(stockMovement)
        .innerJoin(product, eq(product.id, stockMovement.productId))
        .where(eq(stockMovement.businessId, manufacturer.id))
        .orderBy(desc(stockMovement.createdAt))
        .limit(100),
      db
        .select({
          productName: product.name,
          quantity: transaction.quantity,
          status: transaction.status,
          occurredAt: b2bOrderAcceptance.acceptedAt,
        })
        .from(b2bOrderAcceptance)
        .innerJoin(transaction, eq(transaction.id, b2bOrderAcceptance.transactionId))
        .innerJoin(product, eq(product.id, transaction.productId))
        .where(or(eq(transaction.sellerId, manufacturer.id), eq(transaction.buyerId, manufacturer.id)))
        .orderBy(desc(b2bOrderAcceptance.acceptedAt))
        .limit(100),
      db
        .select({
          productName: product.name,
          quantity: b2bDispatch.quantity,
          status: transaction.status,
          occurredAt: b2bDispatch.createdAt,
        })
        .from(b2bDispatch)
        .innerJoin(transaction, eq(transaction.id, b2bDispatch.transactionId))
        .innerJoin(product, eq(product.id, transaction.productId))
        .where(eq(b2bDispatch.sellerBusinessId, manufacturer.id))
        .orderBy(desc(b2bDispatch.createdAt))
        .limit(100),
      db
        .select({
          productName: product.name,
          quantity: b2bReceipt.quantityReceived,
          acceptedQuantity: b2bReceipt.acceptedQuantity,
          damagedQuantity: b2bReceipt.damagedQuantity,
          rejectedQuantity: b2bReceipt.rejectedQuantity,
          disputedQuantity: b2bReceipt.disputedQuantity,
          status: transaction.status,
          occurredAt: b2bReceipt.createdAt,
        })
        .from(b2bReceipt)
        .innerJoin(transaction, eq(transaction.id, b2bReceipt.transactionId))
        .innerJoin(product, eq(product.id, transaction.productId))
        .where(eq(b2bReceipt.buyerBusinessId, manufacturer.id))
        .orderBy(desc(b2bReceipt.createdAt))
        .limit(100),
      db
        .select({ action: auditLog.action, occurredAt: auditLog.createdAt })
        .from(auditLog)
        .where(and(
          eq(auditLog.targetType, "user"),
          eq(auditLog.targetId, manufacturer.id),
          inArray(auditLog.action, [
            "MANUFACTURER_PROFILE_UPDATED",
            "MANUFACTURER_ACCOUNT_SUSPENDED",
            "MANUFACTURER_ACCOUNT_REVIEW_REQUIRED",
            "MANUFACTURER_ACCOUNT_RESTORED",
          ]),
        ))
        .orderBy(desc(auditLog.createdAt))
        .limit(100),
    ]);

    const pendingEvents: Omit<ManufacturerActivityEvent, "key">[] = [
      ...batches.map((row) => ({
        kind: "production" as const,
        title: "Production batch recorded",
        productName: row.productName,
        quantity: row.reportedGoodOutputQuantity ?? row.goodOutputQuantity ?? String(row.declaredQuantity),
        status: row.status,
        occurredAt: row.occurredAt,
      })),
      ...sales.map((row) => ({
        kind: "sales" as const,
        title: "Sale recorded",
        productName: row.productName,
        quantity: String(row.quantity),
        status: row.status,
        occurredAt: row.occurredAt,
      })),
      ...imports.map((row) => ({
        kind: "imports" as const,
        title: "Import declaration recorded",
        productName: row.productName,
        quantity: row.inspectedQuantity === null ? String(row.expectedQuantity) : String(row.inspectedQuantity),
        status: row.status,
        occurredAt: row.occurredAt,
      })),
      ...movements.map((row) => ({
        kind: "stock" as const,
        title: `Stock ${row.movementType.replaceAll("_", " ")}`,
        productName: row.productName,
        quantity: String(row.quantityDelta),
        status: null,
        occurredAt: row.occurredAt,
      })),
      ...acceptances.map((row) => ({
        kind: "fulfillment" as const,
        title: "B2B order accepted",
        productName: row.productName,
        quantity: String(row.quantity),
        status: row.status,
        occurredAt: row.occurredAt,
      })),
      ...dispatches.map((row) => ({
        kind: "fulfillment" as const,
        title: "B2B goods dispatched",
        productName: row.productName,
        quantity: String(row.quantity),
        status: row.status,
        occurredAt: row.occurredAt,
      })),
      ...receipts.map((row) => ({
        kind: "fulfillment" as const,
        title: "B2B receipt recorded",
        productName: row.productName,
        quantity: String(row.quantity),
        status: `accepted ${row.acceptedQuantity} · damaged ${row.damagedQuantity} · rejected ${row.rejectedQuantity} · disputed ${row.disputedQuantity}`,
        occurredAt: row.occurredAt,
      })),
      ...accountEvents.map((row) => ({
        kind: "account" as const,
        title: row.action === "MANUFACTURER_PROFILE_UPDATED"
          ? "Manufacturer profile names updated"
          : row.action === "MANUFACTURER_ACCOUNT_SUSPENDED"
            ? "Manufacturer account suspended"
            : row.action === "MANUFACTURER_ACCOUNT_RESTORED"
              ? "Manufacturer account restored to its previous status"
              : "Manufacturer account marked for review",
        productName: "Account administration",
        quantity: null,
        status: null,
        occurredAt: row.occurredAt,
      })),
    ];

    pendingEvents.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    const events = pendingEvents.slice(0, 200).map((event, index) => ({ ...event, key: `activity-${index}` }));

    return {
      success: true,
      data: {
        manufacturer,
        events,
      },
    };
  } catch (error) {
    reportFailure("activity-read", error);
    return { success: false, error: "Manufacturer activity could not be loaded." };
  }
}

/** Edit only public-facing manufacturer names; contact and taxpayer IDs are excluded. */
export async function editManufacturerProfile(
  input: ProfileEditInput,
): Promise<ManufacturingActivityResult<{ changed: boolean }>> {
  const { user: actor } = await requireRRAPermission("taxpayer.profile.edit");
  const parsed = profileEditSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Provide valid profile details and a reason." };
  const values = parsed.data;

  try {
    return await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ name: user.name, businessName: user.businessName, role: user.role })
        .from(user)
        .where(eq(user.id, values.manufacturerId))
        .for("update")
        .limit(1);

      if (!target || target.role !== "manufacturer") return { success: false, error: "Manufacturer was not found." };

      const changedFields: string[] = [];
      if (target.name !== values.name) changedFields.push("name");
      if ((target.businessName ?? "") !== values.businessName) changedFields.push("businessName");
      if (changedFields.length === 0) return { success: true, data: { changed: false } };

      await tx
        .update(user)
        .set({ name: values.name, businessName: values.businessName || null })
        .where(eq(user.id, values.manufacturerId));

      await logAudit(
        {
          userId: actor.id,
          action: "MANUFACTURER_PROFILE_UPDATED",
          targetType: "user",
          targetId: values.manufacturerId,
          metadata: { changedFields, reason: values.reason },
          beforeState: { name: target.name, businessName: target.businessName },
          afterState: { name: values.name, businessName: values.businessName || null },
        },
        async (entry) => { await tx.insert(auditLog).values(entry); },
      );

      return { success: true, data: { changed: true } };
    });
  } catch (error) {
    reportFailure("profile-edit", error);
    return { success: false, error: "Manufacturer profile could not be updated." };
  }
}

/** Place a manufacturer under review or suspend access with an auditable reason. */
export async function setManufacturerAccountStatus(
  input: AccountStatusInput,
): Promise<ManufacturingActivityResult<{ status: string; isActive: boolean }>> {
  const { user: actor } = await requireRRAPermission("taxpayer.account.manage");
  const parsed = accountStatusSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Provide a valid account action and a reason." };
  const values = parsed.data;

  try {
    return await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ clearanceStatus: user.clearanceStatus, isActive: user.isActive, role: user.role })
        .from(user)
        .where(eq(user.id, values.manufacturerId))
        .for("update")
        .limit(1);

      if (!target || target.role !== "manufacturer") return { success: false, error: "Manufacturer was not found." };

      if (values.status === "restore") {
        if (target.clearanceStatus !== "suspended" && target.clearanceStatus !== "under_review") {
          return { success: false, error: "Only a suspended or under-review manufacturer can have its last account action reversed." };
        }

        const [latestStatusEvent] = await tx
          .select({ id: auditLog.id, action: auditLog.action, metadata: auditLog.metadata, beforeState: auditLog.beforeState, afterState: auditLog.afterState })
          .from(auditLog)
          .where(and(
            eq(auditLog.targetType, "user"),
            eq(auditLog.targetId, values.manufacturerId),
            inArray(auditLog.action, [
              "MANUFACTURER_ACCOUNT_SUSPENDED",
              "MANUFACTURER_ACCOUNT_RESTORED",
              "MANUFACTURER_ACCOUNT_REVIEW_REQUIRED",
              "CLEARANCE_UPDATED",
            ]),
          ))
          .orderBy(desc(auditLog.createdAt))
          .limit(1);

        if (!latestStatusEvent || ![
          "MANUFACTURER_ACCOUNT_SUSPENDED",
          "MANUFACTURER_ACCOUNT_REVIEW_REQUIRED",
          "CLEARANCE_UPDATED",
        ].includes(latestStatusEvent.action)) {
          return { success: false, error: "The latest account action cannot be safely reversed. Ask an authorized reviewer to inspect the account history." };
        }

        const metadata = parseAuditMetadata(latestStatusEvent.metadata);
        const previousStatusValue = latestStatusEvent.beforeState?.clearanceStatus ?? metadata?.previousStatus;
        const recordedCurrentStatus = latestStatusEvent.afterState?.clearanceStatus ?? metadata?.newStatus;
        const recordedCurrentActive = latestStatusEvent.afterState?.isActive ?? metadata?.newActive;
        const previousActiveValue = latestStatusEvent.beforeState?.isActive
          ?? metadata?.previousActive
          // The legacy clearance action changed only clearanceStatus. It did not alter isActive.
          ?? (latestStatusEvent.action === "CLEARANCE_UPDATED" ? target.isActive : undefined);
        const restorableStatuses = ["pending", "approved", "under_review"];
        if (
          typeof previousStatusValue !== "string"
          || !restorableStatuses.includes(previousStatusValue)
          || previousActiveValue !== true
          || recordedCurrentStatus !== target.clearanceStatus
          || (recordedCurrentActive !== undefined && recordedCurrentActive !== target.isActive)
        ) {
          return { success: false, error: "The previous account state is missing or no longer matches the latest account action, so it cannot be safely restored." };
        }

        await tx
          .update(user)
          .set({ clearanceStatus: previousStatusValue, isActive: true })
          .where(eq(user.id, values.manufacturerId));

        await logAudit(
          {
            userId: actor.id,
            action: "MANUFACTURER_ACCOUNT_RESTORED",
            targetType: "user",
            targetId: values.manufacturerId,
            metadata: { reason: values.reason, restoredFromAuditId: latestStatusEvent.id },
            beforeState: { clearanceStatus: target.clearanceStatus, isActive: target.isActive },
            afterState: { clearanceStatus: previousStatusValue, isActive: true },
          },
          async (entry) => { await tx.insert(auditLog).values(entry); },
        );

        return { success: true, data: { status: previousStatusValue, isActive: true } };
      }

      if (target.clearanceStatus === "suspended" || target.isActive === false) {
        return { success: false, error: "This manufacturer is inactive. Restore the previous account state before applying another action." };
      }
      if (target.clearanceStatus === values.status) return { success: false, error: "The manufacturer already has this status." };

      const nextStatus = values.status;
      const nextActive = values.status === "suspended" ? false : target.isActive;
      await tx
        .update(user)
        .set(values.status === "suspended"
          ? { clearanceStatus: "suspended", isActive: false }
          : { clearanceStatus: "under_review" })
        .where(eq(user.id, values.manufacturerId));

      if (values.status === "suspended") {
        await tx.delete(session).where(eq(session.userId, values.manufacturerId));
      }

      await logAudit(
        {
          userId: actor.id,
          action: values.status === "suspended" ? "MANUFACTURER_ACCOUNT_SUSPENDED" : "MANUFACTURER_ACCOUNT_REVIEW_REQUIRED",
          targetType: "user",
          targetId: values.manufacturerId,
          metadata: {
            previousStatus: target.clearanceStatus,
            newStatus: nextStatus,
            previousActive: target.isActive,
            newActive: nextActive,
            reason: values.reason,
          },
          beforeState: { clearanceStatus: target.clearanceStatus, isActive: target.isActive },
          afterState: { clearanceStatus: nextStatus, isActive: nextActive },
        },
        async (entry) => { await tx.insert(auditLog).values(entry); },
      );

      return { success: true, data: { status: nextStatus, isActive: nextActive } };
    });
  } catch (error) {
    reportFailure("account-status", error);
    return { success: false, error: "Manufacturer account status could not be updated." };
  }
}
