export interface VatGuidance {
  configuredVatRatePercent: string;
  rateSource: string;
  calculation: string;
  legalGuidance: string;
}

/** Return app-scoped VAT wording without presenting configuration as tax law. */
export function buildVatGuidance(configuredVatRate: number): VatGuidance {
  if (!Number.isFinite(configuredVatRate) || configuredVatRate < 0 || configuredVatRate > 1) {
    throw new RangeError("Configured VAT rate must be a finite fraction between 0 and 1.");
  }

  return {
    configuredVatRatePercent: `${(configuredVatRate * 100).toLocaleString("en-RW", { maximumFractionDigits: 4 })}%`,
    rateSource: "Current TaxFlow system configuration. This does not confirm the legally applicable rate for any specific supply.",
    calculation: "TaxFlow calculates transaction VAT using the rate and pricing mode saved with that transaction. Recorded output VAT minus recorded input VAT is an informational balance, not an official tax assessment.",
    legalGuidance: "Tax law, exemptions, and filing deadlines are not available from this tool. Check approved official RRA guidance or ask an authorized tax professional.",
  };
}
