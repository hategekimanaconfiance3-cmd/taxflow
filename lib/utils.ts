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
  const num = Number(n) || 0;
  if (num === 0) return "0 RWF";
  const abs = Math.abs(num);
  const sign = num < 0 ? "-" : "";
  if (abs >= 1_000_000_000_000) return `${sign}${(abs / 1_000_000_000_000).toFixed(1)}T RWF`;
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B RWF`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M RWF`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}K RWF`;
  return `${num.toLocaleString()} RWF`;
}
