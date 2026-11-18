export function calculatePercentageChange(previousPrice: number, newPrice: number): number {
  if (!Number.isFinite(previousPrice) || previousPrice <= 0) throw new Error('Previous price must be positive.');
  if (!Number.isFinite(newPrice) || newPrice <= 0) throw new Error('New price must be positive.');
  return Number((((newPrice - previousPrice) / previousPrice) * 100).toFixed(4));
}

export function priceDirection(previousPrice: number, newPrice: number): 'increase' | 'decrease' | 'unchanged' {
  if (newPrice > previousPrice) return 'increase';
  if (newPrice < previousPrice) return 'decrease';
  return 'unchanged';
}

