import { and, desc, eq, inArray, lte, or } from "drizzle-orm";
import db from "@/db/drizzle";
import {
  auditLog,
  notification,
  rraStaff,
  rraStaffRole,
  stockSellThroughThreshold,
  user,
} from "@/db/schema";
import {
  MANDATORY_SELL_THROUGH_THRESHOLD_PERCENT,
  SYSTEM_DEFAULT_SELL_THROUGH_THRESHOLD_ID,
} from "@/lib/stock-sell-through";

export { MANDATORY_SELL_THROUGH_THRESHOLD_PERCENT, SYSTEM_DEFAULT_SELL_THROUGH_THRESHOLD_ID } from "@/lib/stock-sell-through";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbExecutor = typeof db | DbTx;
type ThresholdRow = typeof stockSellThroughThreshold.$inferSelect;

export interface ResolvedSystemSellThroughPolicy {
  id: string;
  thresholdPercent: number;
  effectiveAt: Date;
  createdAt: Date;
  reason: string;
  createdByUserId: string | null;
  createdByRole: string | null;
}

export interface SellThroughPolicyResolution {
  policy: ResolvedSystemSellThroughPolicy | null;
  integrityFailureReason: string | null;
  observedThresholdPercent: number | null;
}

export interface SellThroughPolicyIntegrityContext {
  actorUserId: string;
  businessId: string;
  productId: string;
  sourceType: string;
  sourceId: string;
  at: Date;
}

/**
 * Validate the system-level policy selected for an eligibility decision.
 *
 * The database check constraint protects the normal write path, but runtime
 * validation is deliberately stricter: the mandatory default is 75%, and an
 * administrative revision may only make the rule stricter, never weaker.
 */
export function validateSystemSellThroughPolicy(
  row: ThresholdRow | null | undefined,
  at: Date,
): SellThroughPolicyResolution {
  if (!row) {
    return {
      policy: null,
      integrityFailureReason: "The mandatory system sell-through policy row is missing.",
      observedThresholdPercent: null,
    };
  }

  if (row.scopeType !== "default" || row.scopeKey !== "*") {
    return {
      policy: null,
      integrityFailureReason: "The selected sell-through policy is not a global system policy.",
      observedThresholdPercent: Number.isFinite(Number(row.thresholdPercent)) ? Number(row.thresholdPercent) : null,
    };
  }

  const thresholdPercent = Number(row.thresholdPercent);
  if (!Number.isFinite(thresholdPercent) || thresholdPercent < MANDATORY_SELL_THROUGH_THRESHOLD_PERCENT || thresholdPercent > 100) {
    return {
      policy: null,
      integrityFailureReason: `The selected sell-through policy is invalid or weakens the mandatory ${MANDATORY_SELL_THROUGH_THRESHOLD_PERCENT}% minimum.`,
      observedThresholdPercent: Number.isFinite(thresholdPercent) ? thresholdPercent : null,
    };
  }

  if (!Number.isFinite(row.effectiveAt.getTime()) || row.effectiveAt.getTime() > at.getTime()) {
    return {
      policy: null,
      integrityFailureReason: "The selected sell-through policy is not effective at decision time.",
      observedThresholdPercent: thresholdPercent,
    };
  }

  if (row.id === SYSTEM_DEFAULT_SELL_THROUGH_THRESHOLD_ID && thresholdPercent !== MANDATORY_SELL_THROUGH_THRESHOLD_PERCENT) {
    return {
      policy: null,
      integrityFailureReason: "The migration-seeded mandatory default has been altered.",
      observedThresholdPercent: thresholdPercent,
    };
  }

  return {
    policy: {
      id: row.id,
      thresholdPercent,
      effectiveAt: row.effectiveAt,
      createdAt: row.createdAt,
      reason: row.reason,
      createdByUserId: row.createdByUserId,
      createdByRole: row.createdByRole,
    },
    integrityFailureReason: null,
    observedThresholdPercent: thresholdPercent,
  };
}

async function recordPolicyIntegrityFailure(
  executor: DbExecutor,
  context: SellThroughPolicyIntegrityContext,
  reason: string,
  observedThresholdPercent: number | null,
): Promise<void> {
  await executor.insert(auditLog).values({
    userId: context.actorUserId,
    action: "STOCK_SELL_THROUGH_POLICY_INTEGRITY_FAILURE",
    targetType: "stock_sell_through_threshold",
    targetId: SYSTEM_DEFAULT_SELL_THROUGH_THRESHOLD_ID,
    afterState: {
      businessId: context.businessId,
      productId: context.productId,
      sourceType: context.sourceType,
      sourceId: context.sourceId,
      decisionAt: context.at.toISOString(),
      mandatoryThresholdPercent: MANDATORY_SELL_THROUGH_THRESHOLD_PERCENT,
      observedThresholdPercent,
      reason,
      stockCreditBlocked: true,
    },
    metadata: JSON.stringify({
      sourceType: context.sourceType,
      sourceId: context.sourceId,
      integrityFailure: true,
    }),
  });

  const recipientRows = await executor
    .selectDistinct({ userId: rraStaff.userId })
    .from(rraStaff)
    .innerJoin(user, eq(user.id, rraStaff.userId))
    .leftJoin(rraStaffRole, eq(rraStaffRole.staffRecordId, rraStaff.id))
    .where(and(
      eq(rraStaff.isActive, true),
      eq(user.isActive, true),
      or(
        inArray(rraStaff.clearanceLevel, ["super_admin", "stock_officer", "stock_control_admin"]),
        inArray(rraStaffRole.role, ["super_admin", "stock_officer", "stock_control_admin"]),
      ),
    ));

  if (recipientRows.length > 0) {
    await executor.insert(notification).values(recipientRows.map(({ userId }) => ({
      userId,
      type: "stock_sell_through_policy_integrity",
      title: "Mandatory 75% restocking policy integrity failure",
      message: `Purchased-stock credit was blocked because the mandatory 75% sell-through policy is unavailable or invalid. Reason: ${reason}`,
      link: "/admin/stock-control",
    })));
  }
}

/**
 * Resolve the one system-level policy used by all purchased-stock decisions.
 * Missing or malformed configuration is recorded and returns no policy so the
 * existing calculator and callers fail closed instead of applying a fallback.
 */
export async function resolveSystemSellThroughPolicy(
  tx: DbTx,
  context: SellThroughPolicyIntegrityContext,
): Promise<SellThroughPolicyResolution> {
  const [row] = await tx
    .select()
    .from(stockSellThroughThreshold)
    .where(and(
      eq(stockSellThroughThreshold.scopeType, "default"),
      eq(stockSellThroughThreshold.scopeKey, "*"),
      lte(stockSellThroughThreshold.effectiveAt, context.at),
    ))
    .orderBy(
      desc(stockSellThroughThreshold.effectiveAt),
      desc(stockSellThroughThreshold.createdAt),
      desc(stockSellThroughThreshold.id),
    )
    .limit(1);

  const resolution = validateSystemSellThroughPolicy(row, context.at);
  if (!resolution.policy && resolution.integrityFailureReason) {
    // This path may be followed by a deliberate rollback in the receipt
    // transaction. Persist the integrity signal independently so the alert
    // cannot disappear with the blocked stock operation.
    await recordPolicyIntegrityFailure(
      db,
      context,
      resolution.integrityFailureReason,
      resolution.observedThresholdPercent,
    );
  }
  return resolution;
}
