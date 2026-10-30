import 'server-only';

import { createHash } from 'node:crypto';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import db from '@/db/drizzle';
import {
  aiFinding,
  auditLog,
  productionBatch,
  productionBatchMaterialUsage,
  productionHistoryComparison,
  productionMaterial,
  productionMaterialMovement,
  productionMaterialReceipt,
  productionMaterialReservation,
  notification,
  rraStaff,
  rraStaffRole,
  user,
} from '@/db/schema';
import { emitToUser } from '@/lib/realtime';
import { getProductionHistoryAnalysis } from '@/lib/ai/production-history-service';
import { PRODUCTION_HISTORY_RULE_VERSION } from '@/lib/ai/production-history-baseline';
import { decimalToMicros, microsToDecimal, quantityToMicros } from '@/lib/material-accounting';

const HISTORY_BATCH_LIMIT = 10;

type AlertMetric = {
  code: string;
  signal: string;
  expectedRatio: number | null;
  observedRatio: number | null;
  deviationPercent: number | null;
  thresholdPercent: number;
  baselineBatchCount: number;
  confidence: string;
  evidenceBatchReferences: string[];
};

/** Persist an immutable snapshot and create a review finding after a declaration commits. */
export async function monitorProductionDeclaration(batchId: string): Promise<{ compared: boolean; alerted: boolean }> {
  const [batch] = await db.select({
    id: productionBatch.id,
    manufacturerId: productionBatch.manufacturerId,
    productId: productionBatch.productId,
    batchReference: productionBatch.batchReference,
    recipeVersionId: productionBatch.recipeVersionId,
    declaredQuantity: productionBatch.declaredQuantity,
    plannedOutputQuantity: productionBatch.plannedOutputQuantity,
    reportedGoodOutputQuantity: productionBatch.reportedGoodOutputQuantity,
    reportedRejectedOutputQuantity: productionBatch.reportedRejectedOutputQuantity,
    verifiedGoodOutputQuantity: productionBatch.goodOutputQuantity,
    verifiedRejectedOutputQuantity: productionBatch.rejectedOutputQuantity,
    yieldToleranceStandardId: productionBatch.yieldToleranceStandardId,
    validationStatus: productionBatch.productionValidationStatus,
    status: productionBatch.status,
    materialReviewStatus: productionBatch.materialReviewStatus,
    materialPlanId: productionBatch.materialPlanId,
    periodEnd: productionBatch.periodEnd,
    createdAt: productionBatch.createdAt,
    tin: user.tinNumber,
    businessName: user.businessName,
  }).from(productionBatch)
    .innerJoin(user, eq(productionBatch.manufacturerId, user.id))
    .where(eq(productionBatch.id, batchId)).limit(1);
  if (!batch) return { compared: false, alerted: false };

  const [previousBatches, usages] = await Promise.all([
    db.select({
      id: productionBatch.id,
      batchReference: productionBatch.batchReference,
      recipeVersionId: productionBatch.recipeVersionId,
      plannedOutputQuantity: productionBatch.plannedOutputQuantity,
      declaredQuantity: productionBatch.declaredQuantity,
      reportedGoodOutputQuantity: productionBatch.reportedGoodOutputQuantity,
      reportedRejectedOutputQuantity: productionBatch.reportedRejectedOutputQuantity,
      verifiedGoodOutputQuantity: productionBatch.goodOutputQuantity,
      verifiedRejectedOutputQuantity: productionBatch.rejectedOutputQuantity,
      yieldToleranceStandardId: productionBatch.yieldToleranceStandardId,
      validationStatus: productionBatch.productionValidationStatus,
      status: productionBatch.status,
      materialReviewStatus: productionBatch.materialReviewStatus,
      periodEnd: productionBatch.periodEnd,
    }).from(productionBatch)
      .where(and(
        eq(productionBatch.manufacturerId, batch.manufacturerId),
        eq(productionBatch.productId, batch.productId),
        lt(productionBatch.createdAt, batch.createdAt),
      ))
      .orderBy(desc(productionBatch.createdAt)).limit(HISTORY_BATCH_LIMIT),
    db.select({
      batchUsageId: productionBatchMaterialUsage.id,
      materialId: productionBatchMaterialUsage.materialId,
      materialCode: productionMaterial.materialCode,
      unit: productionMaterial.unit,
      plannedQuantity: productionBatchMaterialUsage.plannedQuantity,
      actualQuantity: productionBatchMaterialUsage.actualQuantity,
      wasteQuantity: productionBatchMaterialUsage.wasteQuantity,
      consumptionToleranceBasisPoints: productionBatchMaterialUsage.consumptionToleranceBasisPoints,
      consumptionToleranceStandardId: productionBatchMaterialUsage.consumptionToleranceStandardId,
    }).from(productionBatchMaterialUsage)
      .innerJoin(productionMaterial, eq(productionBatchMaterialUsage.materialId, productionMaterial.id))
      .where(and(
        eq(productionBatchMaterialUsage.productionBatchId, batch.id),
        eq(productionMaterial.manufacturerId, batch.manufacturerId),
      )),
  ]);

  const materialIds = [...new Set(usages.map((usage) => usage.materialId))];
  const [balanceRows, previousUsageRows, verifiedReceipts, activeReservations] = await Promise.all([
    materialIds.length ? db.select({
    materialId: productionMaterialMovement.materialId,
    balance: sql<string>`COALESCE(SUM(${productionMaterialMovement.quantityDelta}), 0)::text`,
  }).from(productionMaterialMovement)
    .where(and(
      eq(productionMaterialMovement.manufacturerId, batch.manufacturerId),
      inArray(productionMaterialMovement.materialId, materialIds),
    )).groupBy(productionMaterialMovement.materialId) : Promise.resolve([]),
    previousBatches.length ? db.select({
      batchId: productionBatchMaterialUsage.productionBatchId,
      materialId: productionBatchMaterialUsage.materialId,
      materialCode: productionMaterial.materialCode,
      unit: productionMaterial.unit,
      plannedQuantity: productionBatchMaterialUsage.plannedQuantity,
      actualQuantity: productionBatchMaterialUsage.actualQuantity,
      wasteQuantity: productionBatchMaterialUsage.wasteQuantity,
      consumptionToleranceBasisPoints: productionBatchMaterialUsage.consumptionToleranceBasisPoints,
      consumptionToleranceStandardId: productionBatchMaterialUsage.consumptionToleranceStandardId,
    }).from(productionBatchMaterialUsage)
      .innerJoin(productionMaterial, eq(productionBatchMaterialUsage.materialId, productionMaterial.id))
      .where(and(
        inArray(productionBatchMaterialUsage.productionBatchId, previousBatches.map((item) => item.id)),
        eq(productionMaterial.manufacturerId, batch.manufacturerId),
      )) : Promise.resolve([]),
    materialIds.length ? db.select({
      materialId: productionMaterialReceipt.materialId,
      receiptId: productionMaterialReceipt.id,
      origin: productionMaterialReceipt.origin,
      sourceReference: sql<string>`COALESCE(${productionMaterialReceipt.importDeclarationId}, ${productionMaterialReceipt.transactionId}, ${productionMaterialReceipt.supplierReference}, ${productionMaterialReceipt.evidenceReference})`,
      quantity: productionMaterialReceipt.quantity,
      lotReference: productionMaterialReceipt.lotReference,
      unit: productionMaterialReceipt.unit,
      verifiedAt: productionMaterialReceipt.reviewedAt,
    }).from(productionMaterialReceipt)
      .where(and(
        eq(productionMaterialReceipt.manufacturerId, batch.manufacturerId),
        inArray(productionMaterialReceipt.materialId, materialIds),
        eq(productionMaterialReceipt.status, 'verified'),
      )).orderBy(desc(productionMaterialReceipt.reviewedAt)).limit(250) : Promise.resolve([]),
    materialIds.length ? db.select({
      materialId: productionMaterialReservation.materialId,
      planId: productionMaterialReservation.planId,
      reservedQuantity: productionMaterialReservation.reservedQuantity,
    }).from(productionMaterialReservation)
      .where(and(
        eq(productionMaterialReservation.manufacturerId, batch.manufacturerId),
        inArray(productionMaterialReservation.materialId, materialIds),
        eq(productionMaterialReservation.status, 'active'),
      )) : Promise.resolve([]),
  ]);
  const balances = new Map(balanceRows.map((row) => [row.materialId, decimalToMicros(row.balance)]));
  const reservedElsewhereByMaterial = new Map<string, bigint>();
  const reservedForBatchByMaterial = new Map<string, bigint>();
  for (const reservation of activeReservations) {
    const reserved = decimalToMicros(reservation.reservedQuantity);
    if (batch.materialPlanId && reservation.planId === batch.materialPlanId) {
      reservedForBatchByMaterial.set(reservation.materialId, (reservedForBatchByMaterial.get(reservation.materialId) ?? BigInt(0)) + reserved);
    } else {
      reservedElsewhereByMaterial.set(reservation.materialId, (reservedElsewhereByMaterial.get(reservation.materialId) ?? BigInt(0)) + reserved);
    }
  }
  const previousUsageByBatch = new Map<string, typeof previousUsageRows>();
  for (const item of previousUsageRows) previousUsageByBatch.set(item.batchId, [...(previousUsageByBatch.get(item.batchId) ?? []), item]);
  const receiptsByMaterial = new Map<string, typeof verifiedReceipts>();
  for (const receipt of verifiedReceipts) receiptsByMaterial.set(receipt.materialId, [...(receiptsByMaterial.get(receipt.materialId) ?? []), receipt]);
  const materialSnapshot = usages.map((usage) => {
    const required = quantityToMicros(usage.actualQuantity);
    const ledgerBalance = balances.get(usage.materialId) ?? BigInt(0);
    const reservedElsewhere = reservedElsewhereByMaterial.get(usage.materialId) ?? BigInt(0);
    const available = ledgerBalance > reservedElsewhere ? ledgerBalance - reservedElsewhere : BigInt(0);
    return {
      materialId: usage.materialId,
      materialCode: usage.materialCode,
      unit: usage.unit,
      plannedQuantity: usage.plannedQuantity,
      declaredActualQuantity: usage.actualQuantity,
      declaredWasteQuantity: usage.wasteQuantity,
      quantityStatus: 'manufacturer_reported_pending_independent_review',
      consumptionToleranceBasisPoints: usage.consumptionToleranceBasisPoints,
      consumptionToleranceStandardId: usage.consumptionToleranceStandardId,
      ledgerBalanceQuantity: microsToDecimal(ledgerBalance),
      activeReservationsForThisBatch: microsToDecimal(reservedForBatchByMaterial.get(usage.materialId) ?? BigInt(0)),
      activeReservationsForOtherPlans: microsToDecimal(reservedElsewhere),
      availableAfterOtherReservations: microsToDecimal(available),
      verifiedReceipts: (receiptsByMaterial.get(usage.materialId) ?? []).map((receipt) => ({
        receiptId: receipt.receiptId,
        origin: receipt.origin,
        sourceReference: receipt.sourceReference,
        originallyVerifiedQuantity: receipt.quantity,
        lotReference: receipt.lotReference,
        unit: receipt.unit,
        verifiedAt: receipt.verifiedAt?.toISOString() ?? null,
      })),
      shortageQuantity: available < required
        ? microsToDecimal(required - available)
        : '0',
    };
  });
  const hasShortage = materialSnapshot.some((item) => item.shortageQuantity !== '0');

  let historyMetrics: AlertMetric[] = [];
  let historyRuleVersion = PRODUCTION_HISTORY_RULE_VERSION;
  let historyLimitations: string[] = [];
  if (batch.recipeVersionId && batch.tin) {
    const analysis = await getProductionHistoryAnalysis({
      tin: batch.tin,
      batchReference: batch.batchReference,
      lookbackDays: 90,
    });
    if (analysis.found) {
      historyRuleVersion = analysis.ruleVersion;
      historyLimitations = analysis.batches[0]?.dataLimitations ?? [];
      // Deliberately omit analyzer labels because material labels may contain
      // confidential ingredient names. Protected material codes are retained.
      historyMetrics = (analysis.batches[0]?.metrics ?? []).map((metric) => ({
        code: metric.code,
        signal: metric.signal,
        expectedRatio: metric.expectedRatio,
        observedRatio: metric.observedRatio,
        deviationPercent: metric.deviationPercent,
        thresholdPercent: metric.thresholdPercent,
        baselineBatchCount: metric.baselineBatchCount,
        confidence: metric.confidence,
        evidenceBatchReferences: metric.evidenceBatchReferences,
      }));
    }
  } else {
    historyLimitations.push('No recipe version is attached; material and yield standards cannot be compared for this declaration.');
  }

  const unusualMetrics = historyMetrics.filter((metric) => metric.signal === 'unusual');
  const ruleReviewRequired = batch.recipeVersionId !== null && batch.validationStatus === 'review_required';
  const alertReasons = [
    ...(unusualMetrics.length ? ['historical_deviation'] : []),
    ...(ruleReviewRequired ? ['approved_recipe_tolerance'] : []),
    ...(hasShortage ? ['insufficient_verified_material'] : []),
  ];
  const comparisonId = createHash('sha256')
    .update(`${historyRuleVersion}:${batch.id}`)
    .digest('hex');
  const findingId = alertReasons.length
    ? createHash('sha256').update(`${historyRuleVersion}:${batch.id}`).digest('hex')
    : null;
  const snapshot: Record<string, unknown> = {
    schemaVersion: 'production-history-comparison-v2',
    declaration: {
      batchId: batch.id,
      batchReference: batch.batchReference,
      manufacturerId: batch.manufacturerId,
      productId: batch.productId,
      recipeVersionId: batch.recipeVersionId,
      declaredOutputQuantity: batch.declaredQuantity,
      plannedOutputQuantity: batch.plannedOutputQuantity,
      manufacturerReportedGoodOutputQuantity: batch.reportedGoodOutputQuantity,
      manufacturerReportedRejectedOutputQuantity: batch.reportedRejectedOutputQuantity,
      independentlyVerifiedGoodOutputQuantity: batch.verifiedGoodOutputQuantity,
      independentlyVerifiedRejectedOutputQuantity: batch.verifiedRejectedOutputQuantity,
      yieldToleranceStandardId: batch.yieldToleranceStandardId,
      productionValidationStatus: batch.validationStatus,
      productionStatus: batch.status,
      materialReviewStatus: batch.materialReviewStatus,
      outputVerificationStatus: 'pending_independent_review',
    },
    comparisonAt: new Date().toISOString(),
    ruleVersion: historyRuleVersion,
    previousDeclarations: previousBatches.map((previous) => ({
      batchId: previous.id,
      batchReference: previous.batchReference,
      recipeVersionId: previous.recipeVersionId,
      plannedOutputQuantity: previous.plannedOutputQuantity,
      declaredOutputQuantity: previous.declaredQuantity,
      manufacturerReportedGoodOutputQuantity: previous.reportedGoodOutputQuantity,
      manufacturerReportedRejectedOutputQuantity: previous.reportedRejectedOutputQuantity,
      independentlyVerifiedGoodOutputQuantity: previous.verifiedGoodOutputQuantity,
      independentlyVerifiedRejectedOutputQuantity: previous.verifiedRejectedOutputQuantity,
      yieldToleranceStandardId: previous.yieldToleranceStandardId,
      validationStatus: previous.validationStatus,
      materialReviewStatus: previous.materialReviewStatus,
      status: previous.status,
      periodEnd: previous.periodEnd.toISOString(),
      materials: (previousUsageByBatch.get(previous.id) ?? []).map((usage) => ({
        materialId: usage.materialId,
        materialCode: usage.materialCode,
        unit: usage.unit,
        plannedQuantity: usage.plannedQuantity,
        manufacturerReportedActualQuantity: usage.actualQuantity,
        manufacturerReportedWasteQuantity: usage.wasteQuantity,
        consumptionToleranceBasisPoints: usage.consumptionToleranceBasisPoints,
        consumptionToleranceStandardId: usage.consumptionToleranceStandardId,
      })),
    })),
    materials: materialSnapshot,
    metrics: historyMetrics,
    limitations: historyLimitations,
    alertReasons,
    alertFindingId: findingId,
  };
  const responsibleOfficerIds = findingId ? await listResponsibleOfficerIds() : [];
  const notificationTitle = hasShortage ? 'Production material shortage requires review' : 'Production declaration requires review';
  const notificationMessage = `${batch.businessName ?? 'Manufacturer'} · ${batch.batchReference}. Reasons: ${alertReasons.join(', ')}. Review the protected material codes and comparison before releasing or resolving the declaration.`;

  const persisted = await db.transaction(async (tx) => {
    const [comparison] = await tx.insert(productionHistoryComparison).values({
      id: comparisonId,
      productionBatchId: batch.id,
      manufacturerId: batch.manufacturerId,
      productId: batch.productId,
      recipeVersionId: batch.recipeVersionId,
      ruleVersion: historyRuleVersion,
      snapshot,
    }).onConflictDoNothing({ target: productionHistoryComparison.productionBatchId })
      .returning({ id: productionHistoryComparison.id });
    if (!comparison) return { inserted: false, notifications: [] };

    let findingExists = false;
    if (findingId) {
      const metric = unusualMetrics[0];
      const explanation = hasShortage
        ? `Verified material availability is below the declared actual usage for batch ${batch.batchReference}. The declaration remains recorded; production stays held until an authorized reviewer resolves the shortage.`
        : `A possible production variance was detected for batch ${batch.batchReference} against approved tolerance or reliable historical evidence. This is a review signal, not proof of wrongdoing.`;
      const inserted = await tx.insert(aiFinding).values({
        id: findingId,
        findingType: 'production_discrepancy',
        severity: hasShortage ? 'critical' : 'warning',
        businessId: batch.manufacturerId,
        productId: batch.productId,
        observedValue: metric?.observedRatio ?? null,
        expectedValue: metric?.expectedRatio ?? null,
        difference: metric?.deviationPercent ?? null,
        differenceUnit: metric ? 'percent' : null,
        explanation,
        evidenceRefs: JSON.stringify({
          comparisonId,
          batchId: batch.id,
          batchReference: batch.batchReference,
          reasons: alertReasons,
          metricCodes: unusualMetrics.map((item) => item.code),
          ruleVersion: historyRuleVersion,
          nextAction: hasShortage ? 'Resolve verified-stock shortage; do not release this batch.' : 'Review the comparison and supporting production evidence.',
        }),
        detectionMethod: unusualMetrics.length ? 'statistical' : 'deterministic',
        reviewStatus: 'open',
        modelVersion: historyRuleVersion,
      }).onConflictDoNothing({ target: aiFinding.id }).returning({ id: aiFinding.id });
      findingExists = inserted.length > 0;
      if (!findingExists) {
        const [existingFinding] = await tx.select({ id: aiFinding.id }).from(aiFinding)
          .where(eq(aiFinding.id, findingId)).limit(1);
        findingExists = Boolean(existingFinding);
      }
    }

    await tx.insert(auditLog).values({
      userId: batch.manufacturerId,
      action: 'PRODUCTION_HISTORY_COMPARISON_CREATED',
      targetType: 'production_batch',
      targetId: batch.id,
      metadata: JSON.stringify({ comparisonId, ruleVersion: historyRuleVersion, alertReasons, findingId }),
    });
    const notifications = findingExists && responsibleOfficerIds.length > 0 ? await tx.insert(notification).values(responsibleOfficerIds.map((userId) => ({
      userId,
      type: 'system',
      title: notificationTitle,
      message: notificationMessage,
      link: `/admin/production/material-accounting?batchId=${encodeURIComponent(batch.id)}&findingId=${encodeURIComponent(findingId!)}`,
    }))).returning({ id: notification.id, userId: notification.userId, type: notification.type, title: notification.title, message: notification.message, link: notification.link }) : [];
    return { inserted: true, notifications };
  });

  for (const created of persisted.notifications) {
    try {
      emitToUser(created.userId, 'notification', {
        id: created.id,
        type: created.type,
        title: created.title,
        message: created.message,
        link: created.link,
      });
    } catch (error) {
      console.error('[production:history-notification-realtime]', {
        userId: created.userId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }
  return { compared: persisted.inserted, alerted: persisted.notifications.length > 0 };
}

async function listResponsibleOfficerIds(): Promise<string[]> {
  const officers = await db.selectDistinct({ userId: rraStaff.userId })
    .from(rraStaffRole)
    .innerJoin(rraStaff, eq(rraStaffRole.staffRecordId, rraStaff.id))
    .innerJoin(user, eq(rraStaff.userId, user.id))
    .where(and(
      eq(rraStaffRole.role, 'stock_control_admin'),
      eq(rraStaff.isActive, true),
      eq(user.isActive, true),
    ));
  return officers.map((officer) => officer.userId);
}
