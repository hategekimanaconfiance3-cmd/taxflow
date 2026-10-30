import "server-only";

import { and, desc, eq, gte, ilike, inArray, lte, notInArray } from "drizzle-orm";
import db from "@/db/drizzle";
import { product, productionBatch, productionBatchMaterialUsage, productionMaterial, productionRecipe, productionRecipeMaterial, user } from "@/db/schema";
import { analyzeProductionHistoryBatch, PRODUCTION_HISTORY_RULE_VERSION, type ProductionHistoryBatch, type ProductionHistoryUsage } from "@/lib/ai/production-history-baseline";

export interface ProductionHistoryQuery {
  tin: string;
  batchReference?: string;
  productName?: string;
  lookbackDays: number;
}

const MAX_CANDIDATE_BATCHES = 5;
const MAX_VERIFIED_BASELINE_BATCHES_PER_RECIPE = 50;

export async function getProductionHistoryAnalysis(input: ProductionHistoryQuery) {
  const [manufacturer] = await db.select({ id: user.id, businessName: user.businessName })
    .from(user)
    .where(and(eq(user.tinNumber, input.tin), eq(user.role, "manufacturer")))
    .limit(1);
  if (!manufacturer) return { found: false as const, message: "No manufacturer was found for that TIN." };

  const conditions = [
    eq(productionBatch.manufacturerId, manufacturer.id),
    ...(input.batchReference
      ? [eq(productionBatch.batchReference, input.batchReference)]
      : [gte(productionBatch.createdAt, new Date(Date.now() - input.lookbackDays * 86_400_000))]),
    ...(input.productName ? [ilike(product.name, `%${input.productName}%`)] : []),
  ];
  const candidates = await db.select({
    id: productionBatch.id,
    batchReference: productionBatch.batchReference,
    status: productionBatch.status,
    createdAt: productionBatch.createdAt,
    periodEnd: productionBatch.periodEnd,
    productionValidationStatus: productionBatch.productionValidationStatus,
    recipeVersionId: productionRecipe.id,
    recipeCode: productionRecipe.recipeCode,
    recipeVersion: productionRecipe.version,
    recipeOutputQuantity: productionRecipe.outputQuantity,
    yieldToleranceBasisPoints: productionRecipe.yieldToleranceBasisPoints,
    plannedOutputQuantity: productionBatch.plannedOutputQuantity,
    actualOutputQuantity: productionBatch.declaredQuantity,
    productId: product.id,
    productName: product.name,
    productUnit: product.unit,
  }).from(productionBatch)
    .innerJoin(product, eq(productionBatch.productId, product.id))
    .innerJoin(productionRecipe, and(
      eq(productionBatch.recipeVersionId, productionRecipe.id),
      eq(productionRecipe.manufacturerId, manufacturer.id),
      eq(productionRecipe.productId, productionBatch.productId),
    ))
    .where(and(...conditions))
    .orderBy(desc(productionBatch.periodEnd))
    .limit(MAX_CANDIDATE_BATCHES);

  if (candidates.length === 0) {
    return {
      found: true as const,
      manufacturer: manufacturer.businessName ?? "Manufacturer name not recorded",
      period: input.batchReference ? { type: "specific_batch", batchReference: input.batchReference } : { type: "recent", lookbackDays: input.lookbackDays },
      ruleVersion: PRODUCTION_HISTORY_RULE_VERSION,
      batches: [],
      message: "No recipe-linked production batches matched. Legacy batches are not assigned fabricated recipe evidence.",
    };
  }

  const recipeVersionIds = [...new Set(candidates.map((row) => row.recipeVersionId))];
  const candidateIds = candidates.map((row) => row.id);
  const earliestCandidateEnd = new Date(Math.min(...candidates.map((row) => row.periodEnd.getTime())));
  const baselineGroups = await Promise.all(recipeVersionIds.map(async (recipeVersionId) => db.select({
    id: productionBatch.id,
    batchReference: productionBatch.batchReference,
    status: productionBatch.status,
    createdAt: productionBatch.createdAt,
    periodEnd: productionBatch.periodEnd,
    productionValidationStatus: productionBatch.productionValidationStatus,
    recipeVersionId: productionRecipe.id,
    recipeCode: productionRecipe.recipeCode,
    recipeVersion: productionRecipe.version,
    recipeOutputQuantity: productionRecipe.outputQuantity,
    yieldToleranceBasisPoints: productionRecipe.yieldToleranceBasisPoints,
    plannedOutputQuantity: productionBatch.plannedOutputQuantity,
    actualOutputQuantity: productionBatch.declaredQuantity,
  }).from(productionBatch)
    .innerJoin(productionRecipe, and(
      eq(productionBatch.recipeVersionId, productionRecipe.id),
      eq(productionRecipe.manufacturerId, manufacturer.id),
      eq(productionRecipe.productId, productionBatch.productId),
    ))
    .where(and(
      eq(productionBatch.manufacturerId, manufacturer.id),
      eq(productionBatch.recipeVersionId, recipeVersionId),
      eq(productionBatch.status, "independently_supported"),
      eq(productionBatch.productionValidationStatus, "within_tolerance"),
      lte(productionBatch.periodEnd, earliestCandidateEnd),
      notInArray(productionBatch.id, candidateIds),
    ))
    .orderBy(desc(productionBatch.periodEnd))
    .limit(MAX_VERIFIED_BASELINE_BATCHES_PER_RECIPE)));
  const baselineRows = baselineGroups.flat();
  const allBatchRows = [...candidates, ...baselineRows];
  const allBatchIds = [...new Set(allBatchRows.map((row) => row.id))];

  const [recipeLines, usageRows] = await Promise.all([
    db.select({
      recipeVersionId: productionRecipeMaterial.recipeVersionId,
      recipeMaterialId: productionRecipeMaterial.id,
      materialId: productionMaterial.id,
      materialCode: productionMaterial.materialCode,
      materialName: productionMaterial.confidentialName,
      unit: productionMaterial.unit,
      recipeQuantity: productionRecipeMaterial.quantity,
      consumptionToleranceBasisPoints: productionRecipeMaterial.consumptionToleranceBasisPoints,
    }).from(productionRecipeMaterial)
      .innerJoin(productionMaterial, and(
        eq(productionRecipeMaterial.materialId, productionMaterial.id),
        eq(productionMaterial.manufacturerId, manufacturer.id),
      ))
      .where(inArray(productionRecipeMaterial.recipeVersionId, recipeVersionIds))
      .limit(500),
    db.select({
      batchId: productionBatchMaterialUsage.productionBatchId,
      recipeMaterialId: productionBatchMaterialUsage.recipeMaterialId,
      plannedQuantity: productionBatchMaterialUsage.plannedQuantity,
      actualQuantity: productionBatchMaterialUsage.actualQuantity,
      materialId: productionBatchMaterialUsage.materialId,
      consumptionToleranceBasisPoints: productionBatchMaterialUsage.consumptionToleranceBasisPoints,
    }).from(productionBatchMaterialUsage)
      .where(inArray(productionBatchMaterialUsage.productionBatchId, allBatchIds))
      .limit(25_500),
  ]);
  const boundedEvidenceIncomplete = recipeLines.length >= 500 || usageRows.length >= 25_500;

  const usageByBatch = new Map<string, Map<string, { plannedQuantity: number; actualQuantity: number; materialId: string; consumptionToleranceBasisPoints: number | null }>>();
  for (const usage of usageRows) {
    const batchUsage = usageByBatch.get(usage.batchId) ?? new Map();
    batchUsage.set(usage.recipeMaterialId, {
      plannedQuantity: usage.plannedQuantity,
      actualQuantity: usage.actualQuantity,
      materialId: usage.materialId,
      consumptionToleranceBasisPoints: usage.consumptionToleranceBasisPoints,
    });
    usageByBatch.set(usage.batchId, batchUsage);
  }
  const linesByRecipe = new Map<string, ProductionHistoryUsage[]>();
  for (const line of recipeLines) {
    const lines = linesByRecipe.get(line.recipeVersionId) ?? [];
    lines.push({
      recipeMaterialId: line.recipeMaterialId,
      materialId: line.materialId,
      materialCode: line.materialCode,
      materialName: line.materialName,
      unit: line.unit,
      recipeQuantity: line.recipeQuantity,
      consumptionToleranceBasisPoints: line.consumptionToleranceBasisPoints,
      plannedQuantity: null,
      actualQuantity: null,
    });
    linesByRecipe.set(line.recipeVersionId, lines);
  }

  const toObservation = (row: (typeof allBatchRows)[number]): ProductionHistoryBatch => ({
    id: row.id,
    batchReference: row.batchReference,
    status: row.status,
    createdAt: row.createdAt,
    periodEnd: row.periodEnd,
    productionValidationStatus: row.productionValidationStatus,
    recipeVersionId: row.recipeVersionId,
    recipeCode: row.recipeCode,
    recipeVersion: row.recipeVersion,
    recipeOutputQuantity: row.recipeOutputQuantity,
    yieldToleranceBasisPoints: row.yieldToleranceBasisPoints,
    plannedOutputQuantity: row.plannedOutputQuantity,
    actualOutputQuantity: row.actualOutputQuantity,
    materials: (linesByRecipe.get(row.recipeVersionId) ?? []).map((line) => {
      const matchingUsage = usageByBatch.get(row.id)?.get(line.recipeMaterialId);
      const batchUsage = matchingUsage?.materialId === line.materialId ? matchingUsage : undefined;
      return {
        ...line,
        plannedQuantity: batchUsage?.plannedQuantity ?? null,
        actualQuantity: batchUsage?.actualQuantity ?? null,
        consumptionToleranceBasisPoints: batchUsage?.consumptionToleranceBasisPoints ?? line.consumptionToleranceBasisPoints,
      };
    }),
  });

  const baselinesByRecipe = new Map<string, ProductionHistoryBatch[]>();
  for (const row of baselineRows) {
    const rows = baselinesByRecipe.get(row.recipeVersionId) ?? [];
    rows.push(toObservation(row));
    baselinesByRecipe.set(row.recipeVersionId, rows);
  }

  const batches = candidates.map((row) => {
    const candidate = toObservation(row);
    const baseline = baselinesByRecipe.get(candidate.recipeVersionId) ?? [];
    const computedMetrics = analyzeProductionHistoryBatch(candidate, baseline);
    const metrics = boundedEvidenceIncomplete
      ? computedMetrics.map((metric) => ({
        ...metric,
        expectedRatio: null,
        deviationPercent: null,
        signal: "missing_evidence" as const,
      }))
      : computedMetrics;
    return {
      batchId: candidate.id,
      manufacturerId: manufacturer.id,
      productId: row.productId,
      recipeVersionId: candidate.recipeVersionId,
      batchReference: candidate.batchReference,
      product: row.productName,
      productUnit: row.productUnit,
      status: candidate.status,
      recordedAt: candidate.createdAt,
      recipe: { code: candidate.recipeCode, version: candidate.recipeVersion, outputQuantity: candidate.recipeOutputQuantity },
      plannedOutputQuantity: candidate.plannedOutputQuantity,
      actualOutputQuantity: candidate.actualOutputQuantity,
      productionValidationStatus: candidate.productionValidationStatus,
      signalCount: metrics.filter((metric) => metric.signal === "unusual").length,
      repeatedAcrossSelectedBatches: null as boolean | null,
      metrics,
      baselineSource: "up to 50 earlier batches marked independently_supported and within_tolerance for this exact recipe version",
      dataLimitations: [
        ...(baseline.length < 5 ? ["Fewer than five eligible independently supported batches exist; no statistical anomaly conclusion is produced."] : []),
        ...(boundedEvidenceIncomplete ? ["The bounded query reached its material evidence limit; metric comparisons are suppressed to avoid conclusions from incomplete recipe records."] : []),
      ],
    };
  });

  const metricCounts = new Map<string, number>();
  for (const batch of batches) {
    for (const metric of batch.metrics) {
      if (metric.signal === "unusual") metricCounts.set(metric.code, (metricCounts.get(metric.code) ?? 0) + 1);
    }
  }
  for (const batch of batches) {
    batch.repeatedAcrossSelectedBatches = batches.length > 1
      ? batch.metrics.some((metric) => metric.signal === "unusual" && (metricCounts.get(metric.code) ?? 0) > 1)
      : null;
  }

  return {
    found: true as const,
    manufacturer: manufacturer.businessName ?? "Manufacturer name not recorded",
    period: input.batchReference ? { type: "specific_batch", batchReference: input.batchReference } : { type: "recent", lookbackDays: input.lookbackDays },
    ruleVersion: PRODUCTION_HISTORY_RULE_VERSION,
    baselineMinimumBatches: 5,
    batches,
    interpretation: "A statistical signal is a prompt for human review, not proof of fraud, independently verified physical production, or a tax assessment.",
  };
}
