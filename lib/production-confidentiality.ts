export interface ProtectedMaterialEvidence {
  materialCode: string;
  unit: string;
  plannedQuantity: number;
  actualQuantity: number;
}

/** Explicitly projects the fields permitted in standard RRA production views. */
export function sanitizeProductionMaterialEvidence<T extends ProtectedMaterialEvidence>(
  rows: readonly T[],
): ProtectedMaterialEvidence[] {
  return rows.map(({ materialCode, unit, plannedQuantity, actualQuantity }) => ({
    materialCode,
    unit,
    plannedQuantity,
    actualQuantity,
  }));
}
