export type StockMovementEvidence = {
  id: string;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
};

export type MovementReconciliation = {
  movementId: string;
  expectedAfter: number;
  recordedAfter: number;
  difference: number;
  consistent: boolean;
};

/**
 * Checks arithmetic consistency of an individual recorded stock movement.
 * It does not prove physical stock or batch provenance. Small floating point
 * differences are tolerated because legacy quantities use numeric values.
 */
export function reconcileStockMovements(
  movements: StockMovementEvidence[],
  tolerance = 0.000001,
): MovementReconciliation[] {
  return movements.map((movement) => {
    const expectedAfter = movement.quantityBefore + movement.quantityDelta;
    const difference = movement.quantityAfter - expectedAfter;
    return {
      movementId: movement.id,
      expectedAfter,
      recordedAfter: movement.quantityAfter,
      difference,
      consistent:
        Number.isFinite(expectedAfter) &&
        Number.isFinite(movement.quantityAfter) &&
        Math.abs(difference) <= tolerance,
    };
  });
}
