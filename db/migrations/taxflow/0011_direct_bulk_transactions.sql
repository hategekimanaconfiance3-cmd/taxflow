ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "business_type" text NOT NULL DEFAULT 'registered_business';

ALTER TABLE "transaction"
  ADD COLUMN IF NOT EXISTS "transaction_type" text NOT NULL DEFAULT 'STANDARD_B2B_SALE',
  ADD COLUMN IF NOT EXISTS "buyer_type" text NOT NULL DEFAULT 'registered_business',
  ADD COLUMN IF NOT EXISTS "invoice_reference" text,
  ADD COLUMN IF NOT EXISTS "delivery_information" jsonb,
  ADD COLUMN IF NOT EXISTS "payment_status" text NOT NULL DEFAULT 'unpaid';

CREATE INDEX IF NOT EXISTS "txn_type_idx" ON "transaction" ("transaction_type");
