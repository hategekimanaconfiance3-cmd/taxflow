-- Restore the VAT calculation snapshot fields required by B2B sale creation.
-- Existing transactions remain NULL because their historical rate and mode
-- cannot be reconstructed reliably. Safe to run more than once.

BEGIN;

ALTER TABLE public."transaction"
  ADD COLUMN IF NOT EXISTS vat_rate_basis_points INTEGER,
  ADD COLUMN IF NOT EXISTS pricing_mode TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transaction_pricing_mode_check'
      AND conrelid = 'public."transaction"'::regclass
  ) THEN
    ALTER TABLE public."transaction"
      ADD CONSTRAINT transaction_pricing_mode_check
      CHECK (pricing_mode IS NULL OR pricing_mode IN ('exclusive', 'inclusive'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transaction_vat_rate_check'
      AND conrelid = 'public."transaction"'::regclass
  ) THEN
    ALTER TABLE public."transaction"
      ADD CONSTRAINT transaction_vat_rate_check
      CHECK (vat_rate_basis_points IS NULL OR (vat_rate_basis_points >= 0 AND vat_rate_basis_points <= 100000));
  END IF;
END $$;

COMMIT;
