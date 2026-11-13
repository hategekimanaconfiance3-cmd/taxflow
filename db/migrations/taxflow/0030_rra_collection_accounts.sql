-- Migration: 0030_rra_collection_accounts.sql
-- RRA Payment Accounts & Collection Management Module
-- Creates the rra_collection_account table for official RRA bank accounts
-- and Mobile Money collection channels used to receive tax payments.

CREATE TABLE IF NOT EXISTS "rra_collection_account" (
  "id"                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

  -- Account type
  "account_type"      TEXT NOT NULL CHECK ("account_type" IN ('bank_account', 'mobile_money')),

  -- Common fields
  "display_name"      TEXT NOT NULL,         -- Human-readable label e.g. "BK Main Collection Account"
  "currency"          TEXT NOT NULL DEFAULT 'RWF',
  "description"       TEXT,
  "provider_name"     TEXT NOT NULL,         -- Bank name or MoMo provider name
  "provider_integration" TEXT,              -- Provider API identifier / integration key name

  -- Bank-specific (NULL for mobile_money)
  "bank_account_holder" TEXT,
  "bank_account_number" TEXT,               -- Stored encrypted at app level, masked for display
  "masked_account_number" TEXT,             -- e.g. "****1234" — always safe to display
  "bank_branch"       TEXT,

  -- Mobile Money specific (NULL for bank_account)
  "merchant_code"     TEXT,                 -- Merchant code or collection number
  "registered_name"   TEXT,                 -- Registered business/account name

  -- Verification workflow
  "verification_status" TEXT NOT NULL DEFAULT 'pending'
    CHECK ("verification_status" IN ('pending', 'verified', 'rejected', 'reverification_required')),
  "submitted_by"      TEXT NOT NULL REFERENCES "user"("id"),
  "reviewed_by"       TEXT REFERENCES "user"("id"),
  "review_date"       TIMESTAMPTZ,
  "rejection_reason"  TEXT,
  "verified_at"       TIMESTAMPTZ,

  -- Active status (only verified + active accounts accept payments)
  "is_active"         BOOLEAN NOT NULL DEFAULT FALSE,

  -- Soft delete
  "is_deleted"        BOOLEAN NOT NULL DEFAULT FALSE,

  -- Timestamps
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS "rra_collection_account_type_idx"
  ON "rra_collection_account"("account_type");
CREATE INDEX IF NOT EXISTS "rra_collection_account_status_idx"
  ON "rra_collection_account"("verification_status");
CREATE INDEX IF NOT EXISTS "rra_collection_account_active_idx"
  ON "rra_collection_account"("is_active", "verification_status")
  WHERE "is_deleted" = FALSE;

-- Link tax payments to the specific RRA collection account used
ALTER TABLE "tax_payment"
  ADD COLUMN IF NOT EXISTS "rra_account_id" TEXT REFERENCES "rra_collection_account"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "tax_payment_rra_account_idx"
  ON "tax_payment"("rra_account_id");
