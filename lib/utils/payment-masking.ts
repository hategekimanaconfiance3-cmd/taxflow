/** Mask a phone number or bank account for display. */
export function maskIdentifier(raw: string, provider: string): string {
  const s = raw.trim();
  if (provider === "bank_transfer") {
    // Show first 4 and last 4 digits of account number
    if (s.length <= 8) return s.replace(/./g, "*");
    return `${s.slice(0, 4)} ${"*".repeat(Math.max(0, s.length - 8))} ${s.slice(-4)}`;
  }
  // Phone number — show country code + first 2 digits + mask + last 3 digits
  // e.g. +250781234567 → +250 78* *** 567
  const digits = s.replace(/\D/g, "");
  if (digits.length < 7) return s.replace(/\d/g, "*");
  const prefix = digits.slice(0, digits.length <= 10 ? 4 : 5);
  const suffix = digits.slice(-3);
  const masked = "*".repeat(Math.max(1, digits.length - prefix.length - suffix.length));
  return `+${prefix} ${masked} ${suffix}`;
}
