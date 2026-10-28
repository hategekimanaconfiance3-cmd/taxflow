export type MaterialValidationStatus = 'within_tolerance' | 'review_required';

export function calculatePlannedMaterialQuantity(
  batchOutputQuantity: number,
  recipeOutputQuantity: number,
  recipeMaterialQuantity: number,
): number {
  if (![batchOutputQuantity, recipeOutputQuantity, recipeMaterialQuantity].every(Number.isFinite)
    || batchOutputQuantity <= 0 || recipeOutputQuantity <= 0 || recipeMaterialQuantity <= 0) {
    throw new Error('Production quantities must be finite and positive.');
  }
  const planned = batchOutputQuantity * recipeMaterialQuantity / recipeOutputQuantity;
  if (!Number.isFinite(planned) || planned <= 0) throw new Error('Calculated material quantity is outside the supported range.');
  return planned;
}

export function assessMaterialVariance(
  plannedQuantity: number,
  actualQuantity: number,
  toleranceBasisPoints: number,
): { status: MaterialValidationStatus; varianceBasisPoints: number } {
  if (!Number.isFinite(plannedQuantity) || plannedQuantity <= 0
    || !Number.isFinite(actualQuantity) || actualQuantity < 0
    || !Number.isInteger(toleranceBasisPoints) || toleranceBasisPoints < 0 || toleranceBasisPoints > 10_000) {
    throw new Error('Material validation inputs are invalid.');
  }
  const variance = Math.abs(actualQuantity - plannedQuantity) / plannedQuantity * 10_000;
  return {
    status: variance <= toleranceBasisPoints ? 'within_tolerance' : 'review_required',
    varianceBasisPoints: Math.round(variance),
  };
}

export function combineMaterialValidation(statuses: readonly MaterialValidationStatus[]): MaterialValidationStatus {
  return statuses.every((status) => status === 'within_tolerance') ? 'within_tolerance' : 'review_required';
}
