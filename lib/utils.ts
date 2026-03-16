import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number into a human-readable compact string with RWF suffix.
 * Handles K (thousands), M (millions), B (billions), T (trillions).
 */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000_000) return `${sign}${(abs / 1_000_000_000_000).toFixed(1)}T RWF`;
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B RWF`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M RWF`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}K RWF`;
  return `${n.toLocaleString()} RWF`;
}
