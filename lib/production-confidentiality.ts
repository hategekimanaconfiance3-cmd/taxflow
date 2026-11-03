import { multiplyQuantities, microsToDecimal, quantityToMicros } from '@/lib/material-accounting';

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
  const plannedMicros = multiplyQuantities(
    quantityToMicros(batchOutputQuantity),
    quantityToMicros(recipeMaterialQuantity),
    quantityToMicros(recipeOutputQuantity),
  );
  const planned = Number(microsToDecimal(plannedMicros));
  if (!Number.isFinite(planned) || planned <= 0) throw new Error('Calculated material quantity is outside the supported range.');
  return planned;
}

export function calculateMaterialDifference(actualQuantity: number, plannedQuantity: number): number {
  const differenceMicros = quantityToMicros(actualQuantity) - quantityToMicros(plannedQuantity);
  return Number(microsToDecimal(differenceMicros));
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
  const plannedMicros = quantityToMicros(plannedQuantity);
  const actualMicros = quantityToMicros(actualQuantity);
  const differenceMicros = actualMicros >= plannedMicros
    ? actualMicros - plannedMicros
    : plannedMicros - actualMicros;
  const varianceBasisPoints = Number((differenceMicros * BigInt(10_000) + plannedMicros / BigInt(2)) / plannedMicros);
  return {
    status: varianceBasisPoints <= toleranceBasisPoints ? 'within_tolerance' : 'review_required',
    varianceBasisPoints,
  };
}

export function combineMaterialValidation(statuses: readonly MaterialValidationStatus[]): MaterialValidationStatus {
  return statuses.every((status) => status === 'within_tolerance') ? 'within_tolerance' : 'review_required';
}
