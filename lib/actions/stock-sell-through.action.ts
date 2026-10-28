"use server";

import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import db from "@/db/drizzle";
import {
  auditLog,
  b2bOrderAcceptance,
  product,
  stock,
  stockMovement,
  stockReservation,
  stockRestockRequest,
  stockSellThroughCycle,
  stockSellThroughThreshold,
  transaction,
} from "@/db/schema";
import { requireApprovedClearance, requireRRAPermission, requireTraderSession } from "@/lib/auth-guard";
import { hasRRAPermission } from "@/lib/rra-rbac";
import {
  calculateSellThrough,
  resolveSellThroughThreshold,
  type SellThroughThresholdRecord,
  type SellThroughMovement,
} from "@/lib/stock-sell-through";
import {
  stockRestockExceptionReviewSchema,
  stockRestockRequestSchema,
  stockSellThroughBaselineAttestationSchema,
  stockSellThroughThresholdSchema,
} from "@/lib/validation/stock-sell-through.schema";

const MAX_EVIDENCE_ROWS = 500;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function evaluateRequest(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  businessId: string,
  productId: string,
  at: Date,
): Promise<{
  productName: string;
  unit: string;
  categoryCode: string | null;
  stockQuantity: number;
  cycle: typeof stockSellThroughCycle.$inferSelect;
  thresholdId: string | null;
  thresholdPercent: number | null;
  sourceEvidenceRefs: { stockMovementIds: string[]; acceptedB2BTransactionIds: string[]; evidenceComplete: boolean };
  calculation: ReturnType<typeof calculateSellThrough>;
}> {
  const [productRow] = await tx.select({ id: product.id, name: product.name, unit: product.unit, categoryCode: product.categoryCode })
    .from(product).where(eq(product.id, productId)).limit(1);
  if (!productRow) throw new Error("PRODUCT_NOT_FOUND");

  const [stockRow] = await tx.select({ quantity: stock.quantity }).from(stock)
    .where(and(eq(stock.businessId, businessId), eq(stock.productId, productId))).for("update").limit(1);
  if (!stockRow) throw new Error("PRODUCT_NOT_HELD");
  const stockQuantity = Number(stockRow?.quantity ?? 0);

  const thresholdScopes = await Promise.all([
    tx.select().from(stockSellThroughThreshold).where(and(
      eq(stockSellThroughThreshold.scopeType, "product"),
      eq(stockSellThroughThreshold.scopeKey, productId),
      lte(stockSellThroughThreshold.effectiveAt, at),
    )).orderBy(desc(stockSellThroughThreshold.effectiveAt), desc(stockSellThroughThreshold.createdAt), desc(stockSellThroughThreshold.id)).limit(1),
    ...(productRow.categoryCode ? [tx.select().from(stockSellThroughThreshold).where(and(
      eq(stockSellThroughThreshold.scopeType, "category"),
      eq(stockSellThroughThreshold.scopeKey, productRow.categoryCode),
      lte(stockSellThroughThreshold.effectiveAt, at),
    )).orderBy(desc(stockSellThroughThreshold.effectiveAt), desc(stockSellThroughThreshold.createdAt), desc(stockSellThroughThreshold.id)).limit(1)] : []),
    tx.select().from(stockSellThroughThreshold).where(and(
      eq(stockSellThroughThreshold.scopeType, "default"),
      eq(stockSellThroughThreshold.scopeKey, "*"),
      lte(stockSellThroughThreshold.effectiveAt, at),
    )).orderBy(desc(stockSellThroughThreshold.effectiveAt), desc(stockSellThroughThreshold.createdAt), desc(stockSellThroughThreshold.id)).limit(1),
  ]);
  const threshold = resolveSellThroughThreshold(thresholdScopes.flat() as SellThroughThresholdRecord[], productId, productRow.categoryCode, at);

  const [historicalMovement] = await tx.select({ id: stockMovement.id }).from(stockMovement).where(and(
    eq(stockMovement.businessId, businessId),
    eq(stockMovement.productId, productId),
  )).limit(1);

  await tx.insert(stockSellThroughCycle).values({
    businessId,
    productId,
    baselineQuantity: stockQuantity,
    cycleStartedAt: at,
    baselineStatus: stockQuantity > 0 || historicalMovement ? "needs_review" : "ledger_verified",
  }).onConflictDoNothing().returning({ id: stockSellThroughCycle.id });
  const [cycle] = await tx.select().from(stockSellThroughCycle).where(and(
    eq(stockSellThroughCycle.businessId, businessId),
    eq(stockSellThroughCycle.productId, productId),
  )).for("update").limit(1);
  if (!cycle) throw new Error("CYCLE_NOT_AVAILABLE");

  const movementRows = await tx.select({
    id: stockMovement.id,
    movementType: stockMovement.movementType,
    quantityDelta: stockMovement.quantityDelta,
    quantityBefore: stockMovement.quantityBefore,
    quantityAfter: stockMovement.quantityAfter,
    createdAt: stockMovement.createdAt,
    sourceType: stockMovement.sourceType,
    sourceId: stockMovement.sourceId,
  }).from(stockMovement).where(and(
    eq(stockMovement.businessId, businessId),
    eq(stockMovement.productId, productId),
    gte(stockMovement.createdAt, cycle.cycleStartedAt),
    lte(stockMovement.createdAt, at),
  )).orderBy(asc(stockMovement.createdAt), asc(stockMovement.id)).limit(MAX_EVIDENCE_ROWS + 1);

  const reservations = await tx.select({ id: stockReservation.id, transactionId: stockReservation.transactionId, status: stockReservation.status, reservedAt: stockReservation.reservedAt })
    .from(stockReservation).where(and(
    eq(stockReservation.productId, productId),
    eq(stockReservation.sellerId, businessId),
    inArray(stockReservation.status, ["active", "converted"]),
  )).limit(MAX_EVIDENCE_ROWS + 1);

  const acceptedRows = await tx.select({
    transactionId: b2bOrderAcceptance.transactionId,
    quantity: transaction.quantity,
    acceptedAt: b2bOrderAcceptance.acceptedAt,
    reservedAt: stockReservation.reservedAt,
  }).from(b2bOrderAcceptance).innerJoin(transaction, eq(b2bOrderAcceptance.transactionId, transaction.id))
    .leftJoin(stockReservation, eq(stockReservation.transactionId, transaction.id))
    .where(and(
      eq(transaction.sellerId, businessId),
      eq(transaction.productId, productId),
      inArray(transaction.status, ["confirmed", "completed"]),
      gte(b2bOrderAcceptance.acceptedAt, cycle.cycleStartedAt),
      lte(b2bOrderAcceptance.acceptedAt, at),
    )).limit(MAX_EVIDENCE_ROWS + 1);
  const acceptedTransactionIds = new Set(acceptedRows.map((row) => row.transactionId));
  const hasUnresolvedReservation = reservations.some((reservation) =>
    reservation.status === "active"
    || (reservation.status === "converted"
      && reservation.reservedAt.getTime() >= cycle.cycleStartedAt.getTime()
      && !acceptedTransactionIds.has(reservation.transactionId)),
  );

  const calculation = calculateSellThrough({
    thresholdPercent: threshold?.thresholdPercent ?? null,
    evaluatedAt: at,
    baselineQuantity: Number(cycle.baselineQuantity),
    cycleStartedAt: cycle.cycleStartedAt,
    baselineStatus: cycle.baselineStatus as "needs_review" | "ledger_verified",
    currentQuantity: stockQuantity,
    movements: movementRows.slice(0, MAX_EVIDENCE_ROWS) as SellThroughMovement[],
    acceptedB2BSales: acceptedRows.map((row) => ({
      transactionId: row.transactionId,
      quantity: Number(row.quantity),
      acceptedAt: row.acceptedAt,
      reservedAt: row.reservedAt,
    })),
    hasUnresolvedReservation,
    evidenceComplete: movementRows.length <= MAX_EVIDENCE_ROWS
      && acceptedRows.length <= MAX_EVIDENCE_ROWS
      && reservations.length <= MAX_EVIDENCE_ROWS,
  });

  return {
    productName: productRow.name,
    unit: productRow.unit,
    categoryCode: productRow.categoryCode,
    stockQuantity,
    cycle,
    thresholdId: threshold?.id ?? null,
    thresholdPercent: threshold?.thresholdPercent ?? null,
    calculation,
    sourceEvidenceRefs: {
      stockMovementIds: movementRows.slice(0, MAX_EVIDENCE_ROWS).map((row) => row.id),
      acceptedB2BTransactionIds: acceptedRows.slice(0, MAX_EVIDENCE_ROWS).map((row) => row.transactionId),
      evidenceComplete: movementRows.length <= MAX_EVIDENCE_ROWS
        && acceptedRows.length <= MAX_EVIDENCE_ROWS
        && reservations.length <= MAX_EVIDENCE_ROWS,
    },
  };
}

/** Create a restock eligibility request using only the signed-in trader identity. */
export async function createRestockRequestAction(formData: FormData): Promise<void> {
  const session = await requireTraderSession();
  const { suspended, clearanceStatus } = await requireApprovedClearance();
  if (suspended) redirect(`/dashboard/restock?result=clearance&status=${encodeURIComponent(clearanceStatus)}`);
  const rawExceptionReason = field(formData, "exceptionReason").trim();
  const parsed = stockRestockRequestSchema.safeParse({
    productId: field(formData, "productId"),
    requestedQuantity: field(formData, "requestedQuantity"),
    idempotencyKey: field(formData, "idempotencyKey"),
    exceptionReason: rawExceptionReason || undefined,
  });
  if (!parsed.success) redirect("/dashboard/restock?result=invalid");

  let result: "eligible" | "blocked" | "review_required" | "exception_pending" | "product_not_held" | "invalid" | "error" = "error";
  try {
    result = await db.transaction(async (tx) => {
      const businessId = session.user.id;
      const [existing] = await tx.select({
        id: stockRestockRequest.id,
        productId: stockRestockRequest.productId,
        requestedQuantity: stockRestockRequest.requestedQuantity,
        exceptionReason: stockRestockRequest.exceptionReason,
        eligibilityStatus: stockRestockRequest.eligibilityStatus,
        exceptionStatus: stockRestockRequest.exceptionStatus,
      }).from(stockRestockRequest).where(and(
        eq(stockRestockRequest.businessId, businessId),
        eq(stockRestockRequest.idempotencyKey, parsed.data.idempotencyKey),
      )).limit(1);
      if (existing) {
        if (existing.productId !== parsed.data.productId
          || existing.requestedQuantity !== parsed.data.requestedQuantity
          || (existing.eligibilityStatus !== "eligible" && existing.exceptionReason !== (rawExceptionReason || null))) throw new Error("IDEMPOTENCY_KEY_REUSE");
        return existing.exceptionStatus === "pending" ? "exception_pending" : existing.eligibilityStatus as typeof result;
      }

      // Establish the evaluation time only after obtaining the stock lock. A
      // concurrent sale that commits while this action waits must be included
      // in the baseline, not replayed as a post-baseline movement.
      const [lockedStock] = await tx.select({ id: stock.id }).from(stock).where(and(
        eq(stock.businessId, businessId), eq(stock.productId, parsed.data.productId),
      )).for("update").limit(1);
      if (!lockedStock) throw new Error("PRODUCT_NOT_HELD");
      const at = new Date();
      const evaluated = await evaluateRequest(tx, businessId, parsed.data.productId, at);
      const [duplicateAfterLock] = await tx.select({
        productId: stockRestockRequest.productId,
        requestedQuantity: stockRestockRequest.requestedQuantity,
        exceptionReason: stockRestockRequest.exceptionReason,
        eligibilityStatus: stockRestockRequest.eligibilityStatus,
        exceptionStatus: stockRestockRequest.exceptionStatus,
      }).from(stockRestockRequest).where(and(
        eq(stockRestockRequest.businessId, businessId),
        eq(stockRestockRequest.idempotencyKey, parsed.data.idempotencyKey),
      )).limit(1);
      if (duplicateAfterLock) {
        if (duplicateAfterLock.productId !== parsed.data.productId
          || duplicateAfterLock.requestedQuantity !== parsed.data.requestedQuantity
          || (duplicateAfterLock.eligibilityStatus !== "eligible" && duplicateAfterLock.exceptionReason !== (rawExceptionReason || null))) throw new Error("IDEMPOTENCY_KEY_REUSE");
        return duplicateAfterLock.exceptionStatus === "pending"
          ? "exception_pending"
          : duplicateAfterLock.eligibilityStatus as typeof result;
      }
      const exceptionStatus = evaluated.calculation.status !== "eligible" && parsed.data.exceptionReason ? "pending" : "none";
      const [request] = await tx.insert(stockRestockRequest).values({
        businessId,
        productId: parsed.data.productId,
        requestedQuantity: parsed.data.requestedQuantity,
        requestedByUserId: session.user.id,
        idempotencyKey: parsed.data.idempotencyKey,
        cycleId: evaluated.cycle.id,
        cycleStartedAt: evaluated.cycle.cycleStartedAt,
        thresholdId: evaluated.thresholdId,
        thresholdPercent: evaluated.thresholdPercent,
        baselineQuantity: evaluated.calculation.baselineQuantity,
        cohortQuantity: evaluated.calculation.availableCohortQuantity,
        qualifyingSalesQuantity: evaluated.calculation.qualifyingSalesQuantity,
        requiredSalesQuantity: evaluated.calculation.requiredSalesQuantity,
        sellThroughPercent: evaluated.calculation.sellThroughPercent,
        eligibilityStatus: evaluated.calculation.status,
        eligibilityReason: evaluated.calculation.reason,
        sourceEvidenceRefs: JSON.stringify(evaluated.sourceEvidenceRefs),
        evaluatedAt: at,
        exceptionReason: exceptionStatus === "pending" ? parsed.data.exceptionReason : null,
        exceptionStatus,
      }).returning({ id: stockRestockRequest.id });
      if (!request) throw new Error("REQUEST_NOT_SAVED");

      await tx.insert(auditLog).values({
        userId: session.user.id,
        action: exceptionStatus === "pending" ? "STOCK_RESTOCK_EXCEPTION_REQUESTED" : "STOCK_RESTOCK_REQUESTED",
        targetType: "stock_restock_request",
        targetId: request.id,
        beforeState: {
          cycleStartedAt: evaluated.cycle.cycleStartedAt.toISOString(),
          baselineQuantity: evaluated.cycle.baselineQuantity,
          baselineStatus: evaluated.cycle.baselineStatus,
        },
        afterState: {
          businessId,
          productId: parsed.data.productId,
          productName: evaluated.productName,
          cycleId: evaluated.cycle.id,
          cycleStartedAt: evaluated.cycle.cycleStartedAt.toISOString(),
          thresholdId: evaluated.thresholdId,
          requestedQuantity: parsed.data.requestedQuantity,
          thresholdPercent: evaluated.thresholdPercent,
          qualifyingSalesQuantity: evaluated.calculation.qualifyingSalesQuantity,
          requiredSalesQuantity: evaluated.calculation.requiredSalesQuantity,
          sellThroughPercent: evaluated.calculation.sellThroughPercent,
          eligibilityStatus: evaluated.calculation.status,
          exceptionStatus,
          cycleReset: false,
          sourceEvidenceRefs: evaluated.sourceEvidenceRefs,
        },
        metadata: JSON.stringify({
          reason: evaluated.calculation.reason,
          exceptionReason: exceptionStatus === "pending" ? parsed.data.exceptionReason : null,
          stockReceiptCreated: false,
          stockOrVatChanged: false,
        }),
      });
      return exceptionStatus === "pending" ? "exception_pending" : evaluated.calculation.status;
    });
  } catch (error) {
    console.error("Restock request could not be evaluated or saved", error);
    result = error instanceof Error && error.message === "PRODUCT_NOT_HELD" ? "product_not_held"
      : error instanceof Error && error.message === "IDEMPOTENCY_KEY_REUSE" ? "invalid"
        : "error";
  }

  revalidatePath("/dashboard/restock");
  revalidatePath("/admin/stock-control");
  redirect(`/dashboard/restock?result=${result}`);
}

/** Add an immutable, prospectively effective threshold revision. */
export async function createSellThroughThresholdAction(formData: FormData): Promise<void> {
  const { user: actor, staff } = await requireRRAPermission("stock.threshold.read");
  const parsed = stockSellThroughThresholdSchema.safeParse({
    scopeType: field(formData, "scopeType"),
    scopeKey: field(formData, "scopeKey"),
    thresholdPercent: field(formData, "thresholdPercent"),
    effectiveAt: field(formData, "effectiveAt"),
    reason: field(formData, "reason"),
  });
  if (!parsed.success) redirect("/admin/stock-control?result=invalid");

  const managePermission = parsed.data.scopeType === "default"
    ? "stock.threshold.manage.global"
    : "stock.threshold.manage.scoped";
  if (!staff.clearanceRoles.some((role) => hasRRAPermission(role, managePermission))) {
    redirect("/admin/stock-control?result=unauthorized");
  }

  const key = parsed.data.scopeType === "default" ? "*" : parsed.data.scopeKey;
  const effectiveAt = new Date(`${parsed.data.effectiveAt}:00Z`);
  if (!Number.isFinite(effectiveAt.getTime()) || effectiveAt.getTime() < Date.now()) {
    redirect("/admin/stock-control?result=effective_date");
  }

  try {
    await db.transaction(async (tx) => {
      if (parsed.data.scopeType === "product") {
        const [matchedProduct] = await tx.select({ id: product.id }).from(product).where(eq(product.id, key)).limit(1);
        if (!matchedProduct) throw new Error("THRESHOLD_SCOPE_NOT_FOUND");
      }
      if (parsed.data.scopeType === "category") {
        const [matchedCategory] = await tx.select({ id: product.id }).from(product).where(eq(product.categoryCode, key)).limit(1);
        if (!matchedCategory) throw new Error("THRESHOLD_SCOPE_NOT_FOUND");
      }
      const [previousThreshold] = await tx.select({
        id: stockSellThroughThreshold.id,
        thresholdPercent: stockSellThroughThreshold.thresholdPercent,
        effectiveAt: stockSellThroughThreshold.effectiveAt,
      }).from(stockSellThroughThreshold).where(and(
        eq(stockSellThroughThreshold.scopeType, parsed.data.scopeType),
        eq(stockSellThroughThreshold.scopeKey, key),
        lte(stockSellThroughThreshold.effectiveAt, effectiveAt),
      )).orderBy(desc(stockSellThroughThreshold.effectiveAt), desc(stockSellThroughThreshold.createdAt), desc(stockSellThroughThreshold.id)).limit(1);
      const [saved] = await tx.insert(stockSellThroughThreshold).values({
        scopeType: parsed.data.scopeType,
        scopeKey: key,
        thresholdPercent: parsed.data.thresholdPercent,
        effectiveAt,
        reason: parsed.data.reason,
        createdByUserId: actor.id,
      }).returning({ id: stockSellThroughThreshold.id });
      if (!saved) throw new Error("THRESHOLD_NOT_SAVED");
      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "STOCK_SELL_THROUGH_THRESHOLD_CREATED",
        targetType: "stock_sell_through_threshold",
        targetId: saved.id,
        beforeState: previousThreshold ? {
          thresholdId: previousThreshold.id,
          thresholdPercent: previousThreshold.thresholdPercent,
          effectiveAt: previousThreshold.effectiveAt.toISOString(),
        } : null,
        afterState: {
          scopeType: parsed.data.scopeType,
          scopeKey: key,
          thresholdPercent: parsed.data.thresholdPercent,
          effectiveAt: effectiveAt.toISOString(),
          reason: parsed.data.reason,
        },
        metadata: JSON.stringify({ globalScope: parsed.data.scopeType === "default" }),
      });
    });
  } catch (error) {
    console.error("Sell-through threshold could not be saved", error);
    redirect(`/admin/stock-control?result=${error instanceof Error && error.message === "THRESHOLD_SCOPE_NOT_FOUND" ? "scope_not_found" : "error"}`);
  }

  revalidatePath("/admin/stock-control");
  revalidatePath("/dashboard/restock");
  redirect("/admin/stock-control?result=threshold_saved");
}

/** Review a trader's explicit exception request; approval never posts stock or VAT. */
export async function reviewRestockExceptionAction(formData: FormData): Promise<void> {
  const { user: actor } = await requireRRAPermission("stock.restock.exception.review");
  const parsed = stockRestockExceptionReviewSchema.safeParse({
    requestId: field(formData, "requestId"),
    decision: field(formData, "decision"),
    reason: field(formData, "reason"),
  });
  if (!parsed.success) redirect("/admin/stock-control?result=invalid");

  try {
    await db.transaction(async (tx) => {
      const [request] = await tx.select().from(stockRestockRequest)
        .where(eq(stockRestockRequest.id, parsed.data.requestId)).for("update").limit(1);
      if (!request || request.exceptionStatus !== "pending") throw new Error("REQUEST_NOT_PENDING");
      if (request.requestedByUserId === actor.id) throw new Error("SELF_REVIEW_NOT_ALLOWED");

      const reviewedAt = new Date();
      await tx.update(stockRestockRequest).set({
        exceptionStatus: parsed.data.decision === "approve" ? "approved" : "rejected",
        reviewedByUserId: actor.id,
        reviewedAt,
        reviewReason: parsed.data.reason,
      }).where(eq(stockRestockRequest.id, request.id));
      await tx.insert(auditLog).values({
        userId: actor.id,
        action: parsed.data.decision === "approve" ? "STOCK_RESTOCK_EXCEPTION_APPROVED" : "STOCK_RESTOCK_EXCEPTION_REJECTED",
        targetType: "stock_restock_request",
        targetId: request.id,
        beforeState: { exceptionStatus: request.exceptionStatus },
        afterState: {
          exceptionStatus: parsed.data.decision === "approve" ? "approved" : "rejected",
          businessId: request.businessId,
          productId: request.productId,
          requestedQuantity: request.requestedQuantity,
          thresholdPercent: request.thresholdPercent,
          eligibilityStatus: request.eligibilityStatus,
          reviewedByUserId: actor.id,
          reviewedAt: reviewedAt.toISOString(),
          eligibilityDecisionUnchanged: true,
        },
        metadata: JSON.stringify({ reason: parsed.data.reason, traderRequestReason: request.exceptionReason, stockReceiptCreated: false, stockOrVatChanged: false, eligibilitySnapshot: request.eligibilityStatus }),
      });
    });
  } catch (error) {
    console.error("Restock exception review could not be saved", error);
    const result = error instanceof Error && error.message === "SELF_REVIEW_NOT_ALLOWED" ? "self_review" : "review_error";
    redirect(`/admin/stock-control?result=${result}`);
  }

  revalidatePath("/admin/stock-control");
  revalidatePath("/dashboard/restock");
  redirect("/admin/stock-control?result=review_saved");
}

/** Attest only the current recorded TaxFlow balance and start a prospective cohort. */
export async function attestStockSellThroughBaselineAction(formData: FormData): Promise<void> {
  const { user: actor } = await requireRRAPermission("stock.restock.baseline.attest");
  const parsed = stockSellThroughBaselineAttestationSchema.safeParse({
    businessId: field(formData, "businessId"),
    productId: field(formData, "productId"),
    reason: field(formData, "reason"),
  });
  if (!parsed.success) redirect("/admin/stock-control?result=invalid");

  try {
    await db.transaction(async (tx) => {
      const [stockRow] = await tx.select({ id: stock.id, quantity: stock.quantity }).from(stock).where(and(
        eq(stock.businessId, parsed.data.businessId), eq(stock.productId, parsed.data.productId),
      )).for("update").limit(1);
      if (!stockRow) throw new Error("MISSING_STOCK_ROW");
      // Set the next cohort boundary after the stock row is locked so updates
      // committed while this action waited cannot be double-counted.
      const at = new Date();
      const [existingCycle] = await tx.select().from(stockSellThroughCycle).where(and(
        eq(stockSellThroughCycle.businessId, parsed.data.businessId),
        eq(stockSellThroughCycle.productId, parsed.data.productId),
      )).for("update").limit(1);
      const [activeReservation] = await tx.select({ id: stockReservation.id }).from(stockReservation).where(and(
        eq(stockReservation.sellerId, parsed.data.businessId),
        eq(stockReservation.productId, parsed.data.productId),
        eq(stockReservation.status, "active"),
      )).limit(1);
      if (activeReservation) throw new Error("ACTIVE_RESERVATION");
      const [productRow] = await tx.select({ id: product.id }).from(product).where(eq(product.id, parsed.data.productId)).limit(1);
      if (!productRow) throw new Error("PRODUCT_NOT_FOUND");

      const quantity = Number(stockRow?.quantity ?? 0);
      if (!existingCycle) {
        await tx.insert(stockSellThroughCycle).values({
          businessId: parsed.data.businessId,
          productId: parsed.data.productId,
          baselineQuantity: quantity,
          cycleStartedAt: at,
          baselineStatus: "ledger_verified",
          baselineVerifiedByUserId: actor.id,
          baselineVerifiedAt: at,
        }).onConflictDoNothing();
      }
      const [cycle] = await tx.select().from(stockSellThroughCycle).where(and(
        eq(stockSellThroughCycle.businessId, parsed.data.businessId),
        eq(stockSellThroughCycle.productId, parsed.data.productId),
      )).for("update").limit(1);
      if (!cycle) throw new Error("CYCLE_NOT_AVAILABLE");
      await tx.update(stockSellThroughCycle).set({
        baselineQuantity: quantity,
        cycleStartedAt: at,
        baselineStatus: "ledger_verified",
        baselineVerifiedByUserId: actor.id,
        baselineVerifiedAt: at,
        updatedAt: at,
      }).where(eq(stockSellThroughCycle.id, cycle.id));
      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "STOCK_SELL_THROUGH_BASELINE_ATTESTED",
        targetType: "stock_sell_through_cycle",
        targetId: cycle.id,
        beforeState: cycle ? {
          baselineQuantity: cycle.baselineQuantity,
          cycleStartedAt: cycle.cycleStartedAt.toISOString(),
          baselineStatus: cycle.baselineStatus,
        } : null,
        afterState: {
          businessId: parsed.data.businessId,
          productId: parsed.data.productId,
          baselineQuantity: quantity,
          cycleStartedAt: at.toISOString(),
          baselineStatus: "ledger_verified",
          baselineVerifiedByUserId: actor.id,
        },
        metadata: JSON.stringify({ reason: parsed.data.reason, physicalStockIndependentlyVerified: false }),
      });
    });
  } catch (error) {
    console.error("Stock sell-through baseline attestation could not be saved", error);
    const result = error instanceof Error && error.message === "MISSING_STOCK_ROW" ? "missing_stock"
      : error instanceof Error && error.message === "ACTIVE_RESERVATION" ? "active_reservation"
        : "attestation_error";
    redirect(`/admin/stock-control?result=${result}`);
  }

  revalidatePath("/admin/stock-control");
  revalidatePath("/dashboard/restock");
  redirect("/admin/stock-control?result=baseline_attested");
}
