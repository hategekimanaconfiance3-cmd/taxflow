import assert from "node:assert/strict";
import test from "node:test";
import { analyzeProductionHistoryBatch, type ProductionHistoryBatch } from "../lib/ai/production-history-baseline";

function batch(index: number, overrides: Partial<ProductionHistoryBatch> = {}): ProductionHistoryBatch {
  const date = new Date(`2026-0${Math.floor(index / 20) + 1}-${String(index % 20 + 1).padStart(2, "0")}T00:00:00.000Z`);
  return {
    id: `batch-${index}`,
    batchReference: `BATCH-${index}`,
    status: "independently_supported",
    createdAt: date,
    periodEnd: date,
    productionValidationStatus: "within_tolerance",
    recipeVersionId: "recipe-v1",
    recipeCode: "R-1",
    recipeVersion: 1,
    recipeOutputQuantity: 100,
    yieldToleranceBasisPoints: 500,
    plannedOutputQuantity: 100,
    actualOutputQuantity: 100,
    materials: [{
      recipeMaterialId: "line-1",
      materialId: "material-1",
      materialCode: "M-1",
      materialName: "Base oil",
      unit: "kg",
      recipeQuantity: 10,
      consumptionToleranceBasisPoints: 500,
      plannedQuantity: 10,
      actualQuantity: 10,
    }],
    ...overrides,
  };
}

test("historical baseline only uses prior independently supported batches of the same recipe version", () => {
  const target = batch(20, {
    id: "candidate",
    batchReference: "CANDIDATE",
    status: "recorded",
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    periodEnd: new Date("2026-03-01T00:00:00.000Z"),
    plannedOutputQuantity: 100,
    actualOutputQuantity: 150,
    materials: [{
      recipeMaterialId: "line-1",
      materialId: "material-1",
      materialCode: "M-1",
      materialName: "Base oil",
      unit: "kg",
      recipeQuantity: 10,
      consumptionToleranceBasisPoints: 500,
      plannedQuantity: 10,
      actualQuantity: 15,
    }],
  });
  const verified = Array.from({ length: 5 }, (_, index) => batch(index + 1));
  const unverified = batch(6, { status: "recorded", actualOutputQuantity: 500 });
  const otherVersion = batch(7, { recipeVersionId: "recipe-v2", actualOutputQuantity: 600 });
  const future = batch(8, { periodEnd: new Date("2026-04-01T00:00:00.000Z"), actualOutputQuantity: 700 });

  const metrics = analyzeProductionHistoryBatch(target, [...verified, unverified, otherVersion, future]);
  assert.equal(metrics[0]?.baselineBatchCount, 5);
  assert.equal(metrics[0]?.expectedRatio, 1);
  assert.equal(metrics[0]?.signal, "unusual");
  assert.equal(metrics[1]?.baselineBatchCount, 5);
  assert.equal(metrics[1]?.expectedRatio, 0.1);
  assert.equal(metrics[1]?.observedRatio, 0.1);
  assert.equal(metrics[1]?.signal, "within_baseline");
});

test("insufficient verified history is reported without inventing a baseline", () => {
  const target = batch(10, { id: "candidate", status: "recorded" });
  const metrics = analyzeProductionHistoryBatch(target, [batch(1), batch(2), batch(3), batch(4)]);
  assert.equal(metrics[0]?.signal, "insufficient_history");
  assert.equal(metrics[0]?.expectedRatio, null);
  assert.equal(metrics[0]?.confidence, "low");
});

test("material consumption and finished-output tolerances are evaluated independently", () => {
  const target = batch(20, {
    id: "candidate",
    batchReference: "CANDIDATE",
    status: "recorded",
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    periodEnd: new Date("2026-03-01T00:00:00.000Z"),
    yieldToleranceBasisPoints: 5_000,
    actualOutputQuantity: 102,
    materials: [{
      recipeMaterialId: "line-1",
      materialId: "material-1",
      materialCode: "M-1",
      materialName: "Base oil",
      unit: "kg",
      recipeQuantity: 10,
      consumptionToleranceBasisPoints: 1_000,
      plannedQuantity: 10,
      actualQuantity: 12,
    }],
  });
  const metrics = analyzeProductionHistoryBatch(target, Array.from({ length: 5 }, (_, index) => batch(index + 1)));
  assert.equal(metrics[0]?.signal, "within_baseline");
  assert.equal(metrics[1]?.signal, "unusual");
  assert.equal(metrics[1]?.expectedRatio, 0.1);
  assert.equal(metrics[1]?.observedRatio, 12 / 102);
  assert.equal(metrics[1]?.thresholdPercent, 10);
});
