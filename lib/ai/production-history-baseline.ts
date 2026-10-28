export const PRODUCTION_HISTORY_RULE_VERSION = "production-history-robust-v1";
export const MIN_VERIFIED_BASELINE_BATCHES = 5;

export interface ProductionHistoryUsage {
  recipeMaterialId: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  recipeQuantity: number;
  plannedQuantity: number | null;
  actualQuantity: number | null;
}

export interface ProductionHistoryBatch {
  id: string;
  batchReference: string;
  status: string | null;
  createdAt: Date;
  periodEnd: Date;
  productionValidationStatus: string;
  recipeVersionId: string;
  recipeCode: string;
  recipeVersion: number;
  recipeOutputQuantity: number;
  yieldToleranceBasisPoints: number;
  plannedOutputQuantity: number | null;
  actualOutputQuantity: number;
  materials: ProductionHistoryUsage[];
}

export type ProductionHistoryMetric = {
  code: string;
  label: string;
  unit: string;
  expectedRatio: number | null;
  observedRatio: number | null;
  deviationPercent: number | null;
  thresholdPercent: number;
  baselineBatchCount: number;
  confidence: "high" | "medium" | "low";
  signal: "unusual" | "within_baseline" | "insufficient_history" | "missing_evidence";
  evidenceBatchReferences: string[];
};

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function confidenceFor(count: number): ProductionHistoryMetric["confidence"] {
  if (count >= 12) return "high";
  if (count >= MIN_VERIFIED_BASELINE_BATCHES) return "medium";
  return "low";
}

function compareMetric(
  code: string,
  label: string,
  unit: string,
  observedRatio: number | null,
  toleranceBasisPoints: number,
  baselineRows: readonly ProductionHistoryBatch[],
  ratioFor: (row: ProductionHistoryBatch) => number | null,
): ProductionHistoryMetric {
  const observations = baselineRows
    .map((row) => ({ row, ratio: ratioFor(row) }))
    .filter((item): item is { row: ProductionHistoryBatch; ratio: number } => item.ratio !== null && Number.isFinite(item.ratio));
  const evidenceBatchReferences = observations.map(({ row }) => row.batchReference);
  if (observedRatio === null || !Number.isFinite(observedRatio)) {
    return { code, label, unit, expectedRatio: null, observedRatio: null, deviationPercent: null, thresholdPercent: 0, baselineBatchCount: observations.length, confidence: confidenceFor(observations.length), signal: "missing_evidence", evidenceBatchReferences };
  }
  if (observations.length < MIN_VERIFIED_BASELINE_BATCHES) {
    return { code, label, unit, expectedRatio: null, observedRatio, deviationPercent: null, thresholdPercent: 0, baselineBatchCount: observations.length, confidence: "low", signal: "insufficient_history", evidenceBatchReferences };
  }

  const expectedRatio = median(observations.map(({ ratio }) => ratio));
  const medianAbsoluteDeviation = median(observations.map(({ ratio }) => Math.abs(ratio - expectedRatio)));
  const historicalThresholdPercent = 3 * medianAbsoluteDeviation * 100;
  const recipeThresholdPercent = toleranceBasisPoints / 100;
  const thresholdPercent = Math.max(historicalThresholdPercent, recipeThresholdPercent);
  const deviationPercent = expectedRatio === 0
    ? (observedRatio === 0 ? 0 : Number.POSITIVE_INFINITY)
    : ((observedRatio - expectedRatio) / Math.abs(expectedRatio)) * 100;
  const signal = Math.abs(deviationPercent) > thresholdPercent ? "unusual" : "within_baseline";

  return {
    code,
    label,
    unit,
    expectedRatio,
    observedRatio,
    deviationPercent: Number.isFinite(deviationPercent) ? deviationPercent : null,
    thresholdPercent,
    baselineBatchCount: observations.length,
    confidence: confidenceFor(observations.length),
    signal,
    evidenceBatchReferences,
  };
}

export function analyzeProductionHistoryBatch(
  candidate: ProductionHistoryBatch,
  priorVerifiedBatches: readonly ProductionHistoryBatch[],
): ProductionHistoryMetric[] {
  const relevantBaseline = priorVerifiedBatches.filter((row) =>
    row.recipeVersionId === candidate.recipeVersionId
    && row.id !== candidate.id
    && row.status === "independently_supported"
    && row.productionValidationStatus === "within_tolerance"
    && row.periodEnd.getTime() <= candidate.periodEnd.getTime(),
  );

  const plannedOutput = candidate.plannedOutputQuantity;
  const observedYieldRatio = plannedOutput && plannedOutput > 0 ? candidate.actualOutputQuantity / plannedOutput : null;
  const metrics = [compareMetric(
    "output_yield",
    "Finished output yield",
    "ratio of actual to planned output",
    observedYieldRatio,
    candidate.yieldToleranceBasisPoints,
    relevantBaseline,
    (row) => row.plannedOutputQuantity && row.plannedOutputQuantity > 0 ? row.actualOutputQuantity / row.plannedOutputQuantity : null,
  )];

  for (const material of candidate.materials) {
    const observedUsageRatio = material.plannedQuantity && material.plannedQuantity > 0 && material.actualQuantity !== null
      ? material.actualQuantity / material.plannedQuantity
      : null;
    metrics.push(compareMetric(
      `material_usage:${material.materialCode}`,
      `Material usage — ${material.materialName}`,
      material.unit,
      observedUsageRatio,
      0,
      relevantBaseline,
      (row) => {
        const historicalMaterial = row.materials.find((item) => item.materialId === material.materialId);
        return historicalMaterial?.plannedQuantity && historicalMaterial.plannedQuantity > 0 && historicalMaterial.actualQuantity !== null
          ? historicalMaterial.actualQuantity / historicalMaterial.plannedQuantity
          : null;
      },
    ));
  }

  return metrics;
}
