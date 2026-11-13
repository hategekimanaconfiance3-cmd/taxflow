-- Reconcile payment schema migrations 0029/0030 for databases where files were
-- present but their journal entries were missing. Operations are safe if either
-- original migration was already applied manually.

CREATE TABLE IF NOT EXISTS "payment_method" (
  "id" TEXT PRIMARY KEY,
  "business_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "provider" TEXT NOT NULL,
  "label" TEXT,
  "masked_identifier" TEXT NOT NULL,
  "full_identifier" TEXT NOT NULL,
  "is_default" BOOLEAN NOT NULL DEFAULT FALSE,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "payment_method_business_idx" ON "payment_method"("business_id");
CREATE INDEX IF NOT EXISTS "payment_method_business_provider_idx" ON "payment_method"("business_id", "provider");
ALTER TABLE "tax_payment" ADD COLUMN IF NOT EXISTS "payment_percentage" NUMERIC(5,2);
ALTER TABLE "tax_payment" ADD COLUMN IF NOT EXISTS "outstanding_at_submission" INTEGER;
ALTER TABLE "tax_payment" ADD COLUMN IF NOT EXISTS "payment_method_id" TEXT REFERENCES "payment_method"("id") ON DELETE SET NULL;
ALTER TABLE "tax_payment" ADD COLUMN IF NOT EXISTS "payer_display" TEXT;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rra_collection_account" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "account_type" TEXT NOT NULL CHECK ("account_type" IN ('bank_account', 'mobile_money')),
  "display_name" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'RWF',
  "description" TEXT,
  "provider_name" TEXT NOT NULL,
  "provider_integration" TEXT,
  "bank_account_holder" TEXT,
  "bank_account_number" TEXT,
  "masked_account_number" TEXT,
  "bank_branch" TEXT,
  "merchant_code" TEXT,
  "registered_name" TEXT,
  "verification_status" TEXT NOT NULL DEFAULT 'pending'
    CHECK ("verification_status" IN ('pending', 'verified', 'rejected', 'reverification_required')),
  "submitted_by" TEXT NOT NULL REFERENCES "user"("id"),
  "reviewed_by" TEXT REFERENCES "user"("id"),
  "review_date" TIMESTAMPTZ,
  "rejection_reason" TEXT,
  "verified_at" TIMESTAMPTZ,
  "is_active" BOOLEAN NOT NULL DEFAULT FALSE,
  "is_deleted" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "rra_collection_account_type_idx" ON "rra_collection_account"("account_type");
CREATE INDEX IF NOT EXISTS "rra_collection_account_status_idx" ON "rra_collection_account"("verification_status");
CREATE INDEX IF NOT EXISTS "rra_collection_account_active_idx"
  ON "rra_collection_account"("is_active", "verification_status") WHERE "is_deleted" = FALSE;
ALTER TABLE "tax_payment" ADD COLUMN IF NOT EXISTS "rra_account_id" TEXT REFERENCES "rra_collection_account"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "tax_payment_rra_account_idx" ON "tax_payment"("rra_account_id");
