import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import db from "@/db/drizzle";
import { auditLog, b2bOrderAcceptance, product, stock, stockMovement, stockReservation, stockRestockRequest, stockSellThroughCycle, transaction } from "@/db/schema";
import { calculateSellThrough, type SellThroughMovement } from "@/lib/stock-sell-through";
import { MANDATORY_SELL_THROUGH_THRESHOLD_PERCENT, resolveSystemSellThroughPolicy } from "@/lib/stock-sell-through-policy";

const MAX_EVIDENCE_ROWS = 500;
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbExecutor = typeof db | DbTx;

async function recordEligibilityDecision(executor: DbExecutor, entry: typeof auditLog.$inferInsert): Promise<void> {
  await executor.insert(auditLog).values(entry);
}

/**
 * Assert a prospective purchased-stock receipt is eligible. The caller must
 * run this inside the same transaction as its stock update. Locking stock and
 * the unique seller/product cycle serializes concurrent receipts.
 */
export async function assertPurchasedStockReceiptEligible(
  tx: DbTx,
  businessId: string,
  productId: string,
  receiptQuantity: number,
  actorUserId: string,
  sourceType: string,
  sourceId: string,
  at = new Date(),
) {
  const [item] = await tx.select({ id: product.id, name: product.name })
    .from(product).where(eq(product.id, productId)).limit(1);
  if (!item) throw new Error("Product not found.");

  const [balance] = await tx.select({ quantity: stock.quantity }).from(stock)
    .where(and(eq(stock.businessId, businessId), eq(stock.productId, productId))).for("update").limit(1);
  let currentQuantity = Number(balance?.quantity ?? 0);

  const [priorMovement] = await tx.select({ id: stockMovement.id }).from(stockMovement)
    .where(and(eq(stockMovement.businessId, businessId), eq(stockMovement.productId, productId))).limit(1);
  await tx.insert(stockSellThroughCycle).values({
    businessId, productId, baselineQuantity: currentQuantity, cycleStartedAt: at,
    baselineStatus: currentQuantity === 0 && !priorMovement ? "ledger_verified" : "needs_review",
  }).onConflictDoNothing();
  const [cycle] = await tx.select().from(stockSellThroughCycle).where(and(
    eq(stockSellThroughCycle.businessId, businessId), eq(stockSellThroughCycle.productId, productId),
  )).for("update").limit(1);
  if (!cycle) throw new Error("Stock eligibility could not be verified. Please request an authorized review.");
  // Re-read after acquiring the per-product cycle lock so a concurrent first
  // receipt is included in the ledger and cannot pass against a stale zero.
  const [latestBalance] = await tx.select({ quantity: stock.quantity }).from(stock)
    .where(and(eq(stock.businessId, businessId), eq(stock.productId, productId))).for("update").limit(1);
  currentQuantity = Number(latestBalance?.quantity ?? 0);

  const policyResolution = await resolveSystemSellThroughPolicy(tx, {
    actorUserId,
    businessId,
    productId,
    sourceType,
    sourceId,
    at,
  });
  const policy = policyResolution.policy;
  const movements = await tx.select({
    id: stockMovement.id, movementType: stockMovement.movementType, quantityDelta: stockMovement.quantityDelta,
    quantityBefore: stockMovement.quantityBefore, quantityAfter: stockMovement.quantityAfter,
    createdAt: stockMovement.createdAt, sourceType: stockMovement.sourceType, sourceId: stockMovement.sourceId,
  }).from(stockMovement).where(and(
    eq(stockMovement.businessId, businessId), eq(stockMovement.productId, productId),
    gte(stockMovement.createdAt, cycle.cycleStartedAt), lte(stockMovement.createdAt, at),
  )).orderBy(asc(stockMovement.createdAt), asc(stockMovement.id)).limit(MAX_EVIDENCE_ROWS + 1);
  const reservations = await tx.select({ transactionId: stockReservation.transactionId, status: stockReservation.status, reservedAt: stockReservation.reservedAt })
    .from(stockReservation).where(and(eq(stockReservation.productId, productId), eq(stockReservation.sellerId, businessId), inArray(stockReservation.status, ["active", "converted"]))).limit(MAX_EVIDENCE_ROWS + 1);
  const accepted = await tx.select({
    transactionId: b2bOrderAcceptance.transactionId, quantity: transaction.quantity,
    acceptedAt: b2bOrderAcceptance.acceptedAt, reservedAt: stockReservation.reservedAt,
  }).from(b2bOrderAcceptance).innerJoin(transaction, eq(b2bOrderAcceptance.transactionId, transaction.id))
    .leftJoin(stockReservation, eq(stockReservation.transactionId, transaction.id)).where(and(
      eq(transaction.sellerId, businessId), eq(transaction.productId, productId),
      inArray(transaction.status, ["confirmed", "completed"]),
      gte(b2bOrderAcceptance.acceptedAt, cycle.cycleStartedAt), lte(b2bOrderAcceptance.acceptedAt, at),
    )).limit(MAX_EVIDENCE_ROWS + 1);
  const acceptedIds = new Set(accepted.map((row) => row.transactionId));
  const hasUnresolvedReservation = reservations.some((row) => row.status === "active"
    || (row.status === "converted" && row.reservedAt.getTime() >= cycle.cycleStartedAt.getTime() && !acceptedIds.has(row.transactionId)));
  const complete = movements.length <= MAX_EVIDENCE_ROWS && reservations.length <= MAX_EVIDENCE_ROWS && accepted.length <= MAX_EVIDENCE_ROWS;
  const result = calculateSellThrough({
    thresholdPercent: policy?.thresholdPercent ?? null, evaluatedAt: at,
    baselineQuantity: Number(cycle.baselineQuantity), cycleStartedAt: cycle.cycleStartedAt,
    baselineStatus: cycle.baselineStatus as "needs_review" | "ledger_verified", currentQuantity,
    movements: movements.slice(0, MAX_EVIDENCE_ROWS) as SellThroughMovement[],
    acceptedB2BSales: accepted.map((row) => ({ transactionId: row.transactionId, quantity: Number(row.quantity), acceptedAt: row.acceptedAt, reservedAt: row.reservedAt })),
    hasUnresolvedReservation, evidenceComplete: complete,
  });
  const [approvedException] = await tx.select({
    id: stockRestockRequest.id,
    requestedQuantity: stockRestockRequest.requestedQuantity,
    eligibilityStatus: stockRestockRequest.eligibilityStatus,
    exceptionReason: stockRestockRequest.exceptionReason,
  }).from(stockRestockRequest).where(and(
    eq(stockRestockRequest.businessId, businessId),
    eq(stockRestockRequest.productId, productId),
    eq(stockRestockRequest.exceptionStatus, "approved"),
    gte(stockRestockRequest.requestedQuantity, receiptQuantity),
  )).orderBy(desc(stockRestockRequest.reviewedAt), desc(stockRestockRequest.createdAt)).for("update").limit(1);

  const decisionOutcome = !policy
    ? "policy_integrity_failure"
    : result.status === "eligible"
      ? "eligible"
      : approvedException
        ? "approved_exception"
        : result.status;
  const decisionAudit = {
    userId: actorUserId,
    action: "STOCK_PURCHASED_RECEIPT_ELIGIBILITY_EVALUATED",
    targetType: sourceType,
    targetId: sourceId,
    afterState: {
      businessId,
      productId,
      sourceType,
      sourceId,
      evaluatedAt: at.toISOString(),
      eligiblePurchaseQuantity: result.availableCohortQuantity,
      verifiedSalesQuantity: result.qualifyingSalesQuantity,
      sellThroughPercent: result.sellThroughPercent,
      thresholdPercent: policy?.thresholdPercent ?? null,
      mandatoryThresholdPercent: MANDATORY_SELL_THROUGH_THRESHOLD_PERCENT,
      eligibilityResult: result.status,
      decisionOutcome,
      exceptionReference: approvedException?.id ?? null,
      receiptQuantity,
    },
    metadata: JSON.stringify({
      calculationReason: result.reason,
      exceptionStatus: approvedException ? "approved" : "none",
    }),
  } satisfies typeof auditLog.$inferInsert;

  const receiptBlocked = !policy || (result.status !== "eligible" && !approvedException);
  // A rejected receipt rolls back its caller's transaction. Keep the decision
  // evidence durable by writing blocked outcomes through the base connection;
  // successful outcomes remain atomic with the stock credit.
  await recordEligibilityDecision(receiptBlocked ? db : tx, decisionAudit);

  // An authorized exception cannot mask an unavailable or corrupted mandatory
  // policy. Restore the system policy before any purchased stock is credited.
  if (!policy) {
    throw new Error(`Restocking is unavailable for ${item.name}. The mandatory ${MANDATORY_SELL_THROUGH_THRESHOLD_PERCENT}% sell-through policy could not be verified; purchased-stock credit is blocked and TF administrators have been notified. ${policyResolution.integrityFailureReason ?? "System policy integrity failure."}`);
  }

  if (result.status !== "eligible" && !approvedException) {
    const pct = result.sellThroughPercent === null ? "unknown" : `${result.sellThroughPercent.toFixed(1)}%`;
    const remaining = result.status === "blocked" ? ` Sell ${result.remainingSalesQuantity.toLocaleString()} more ${item.name} units to qualify.` : "";
    const thresholdMessage = policy ? `required threshold is ${policy.thresholdPercent}%.` : "no authorized sell-through threshold is configured.";
    throw new Error(`Restocking is unavailable for ${item.name}. Recorded sell-through is ${pct}; ${thresholdMessage} ${result.reason}${remaining} Request an authorized stock review if your opening balance or evidence is incomplete.`);
  }

  if (approvedException) {
    await tx.update(stockRestockRequest).set({ exceptionStatus: "consumed" })
      .where(and(eq(stockRestockRequest.id, approvedException.id), eq(stockRestockRequest.exceptionStatus, "approved")));
    await tx.insert(auditLog).values({
      userId: actorUserId,
      action: "STOCK_RESTOCK_EXCEPTION_CONSUMED",
      targetType: "stock_restock_request",
      targetId: approvedException.id,
      beforeState: { exceptionStatus: "approved" },
      afterState: { exceptionStatus: "consumed", businessId, productId, receiptQuantity, sourceType, sourceId },
      metadata: JSON.stringify({ eligibilityStatus: result.status, reviewerApprovedQuantity: approvedException.requestedQuantity, traderReason: approvedException.exceptionReason }),
    });
  }
  return result;
}
