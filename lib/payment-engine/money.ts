const FIXED_AMOUNT = /^(?:0|[1-9]\d{0,17})(?:\.\d{1,2})?$/;

/** Parse a database/UI decimal without converting money through floating point. */
export function amountToMinorUnits(value: string): bigint {
  if (!FIXED_AMOUNT.test(value)) throw new Error('Amount must be a non-negative decimal with at most two fractional digits.');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
}

export function minorUnitsToAmount(value: bigint): string {
  if (value < BigInt(0)) throw new Error('Amount cannot be negative.');
  const whole = value / BigInt(100);
  const fraction = (value % BigInt(100)).toString().padStart(2, '0');
  return `${whole}.${fraction}`;
}

export function amountIsWholeUnit(value: string): boolean {
  return amountToMinorUnits(value) % BigInt(100) === BigInt(0);
}
