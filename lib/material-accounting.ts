const SCALE = BigInt(1_000_000);

/** Converts a finite quantity with at most six decimal places to exact micros. */
export function quantityToMicros(value: number): bigint {
  if (!Number.isFinite(value) || !Number.isSafeInteger(Math.round(value * Number(SCALE)))) {
    throw new Error('Quantity is outside the supported range.');
  }
  const rounded = Math.round(value * Number(SCALE));
  if (Math.abs(value - rounded / Number(SCALE)) > 1e-9) {
    throw new Error('Quantity supports at most 6 decimal places.');
  }
  return BigInt(rounded);
}

export function decimalToMicros(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,6}))?$/.exec(value.trim());
  if (!match) throw new Error('Stored quantity is not a valid six-place decimal.');
  const fraction = (match[3] ?? '').padEnd(6, '0');
  const absolute = BigInt(match[2]) * SCALE + BigInt(fraction || '0');
  return match[1] === '-' ? -absolute : absolute;
}

export function microsToDecimal(value: bigint): string {
  const zero = BigInt(0);
  const sign = value < zero ? '-' : '';
  const absolute = value < zero ? -value : value;
  const whole = absolute / SCALE;
  const fraction = (absolute % SCALE).toString().padStart(6, '0').replace(/0+$/, '');
  return `${sign}${whole.toString()}${fraction ? `.${fraction}` : ''}`;
}

export function multiplyQuantities(outputMicros: bigint, perOutputMicros: bigint, recipeOutputMicros: bigint): bigint {
  const zero = BigInt(0);
  if (outputMicros <= zero || perOutputMicros <= zero || recipeOutputMicros <= zero) {
    throw new Error('Production quantities must be positive.');
  }
  const numerator = outputMicros * perOutputMicros;
  return (numerator + recipeOutputMicros / BigInt(2)) / recipeOutputMicros;
}

export function normalizeMaterialUnit(unit: string): string {
  return unit.trim().toLocaleLowerCase('en-US');
}
