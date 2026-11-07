-- Migration: 0029_smart_payment_methods
-- Adds saved payment methods table and extends tax_payment with partial-payment support

-- ---------------------------------------------------------------------------
-- 1. payment_method — saved payment methods per business
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "payment_method" (
  "id"                TEXT PRIMARY KEY,
  "business_id"       TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "provider"          TEXT NOT NULL,              -- 'mtn_mobile_money' | 'airtel_money' | 'bank_transfer'
  "label"             TEXT,                        -- user-defined nickname e.g. "My MTN"
  "masked_identifier" TEXT NOT NULL,              -- "+250 78* *** 456" — displayed to user
  "full_identifier"   TEXT NOT NULL,              -- actual phone/account — server-only, never client-exposed raw
  "is_default"        BOOLEAN NOT NULL DEFAULT FALSE,
  "is_active"         BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"        TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at"        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "payment_method_business_idx"
  ON "payment_method"("business_id");

CREATE INDEX IF NOT EXISTS "payment_method_business_provider_idx"
  ON "payment_method"("business_id", "provider");

-- ---------------------------------------------------------------------------
-- 2. Extend tax_payment with partial-payment columns
-- ---------------------------------------------------------------------------

-- Percentage of outstanding balance being paid (95.00–100.00)
ALTER TABLE "tax_payment"
  ADD COLUMN IF NOT EXISTS "payment_percentage"  NUMERIC(5,2);

-- Outstanding balance at time of submission (snapshot — for receipts)
ALTER TABLE "tax_payment"
  ADD COLUMN IF NOT EXISTS "outstanding_at_submission" INTEGER;

-- Optional FK to saved payment method used (NULL = one-off / cash)
ALTER TABLE "tax_payment"
  ADD COLUMN IF NOT EXISTS "payment_method_id" TEXT REFERENCES "payment_method"("id") ON DELETE SET NULL;

-- Payer identifier used at time of submission (masked, for display on receipt)
ALTER TABLE "tax_payment"
  ADD COLUMN IF NOT EXISTS "payer_display"  TEXT;
