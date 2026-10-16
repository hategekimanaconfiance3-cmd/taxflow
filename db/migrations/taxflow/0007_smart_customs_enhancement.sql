-- Migration: 0007_smart_customs_enhancement.sql
-- Adds Smart Customs fields to import_declaration table.
-- Safe to run multiple times (uses IF NOT EXISTS / IF EXISTS guards).
-- Run via: pnpm db:migrate

-- Smart Customs: unique declaration reference (auto-generated if null)
ALTER TABLE import_declaration
  ADD COLUMN IF NOT EXISTS declaration_ref TEXT UNIQUE;

-- Supplier / exporter name
ALTER TABLE import_declaration
  ADD COLUMN IF NOT EXISTS supplier TEXT;

-- Estimated value in declared currency
ALTER TABLE import_declaration
  ADD COLUMN IF NOT EXISTS estimated_value REAL;

-- Currency code (e.g. USD, EUR, RWF)
ALTER TABLE import_declaration
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';

-- Expected return / arrival date (for pre-travel declarations)
ALTER TABLE import_declaration
  ADD COLUMN IF NOT EXISTS expected_return_date TIMESTAMP;

-- RRA officer review note (written during inspection)
ALTER TABLE import_declaration
  ADD COLUMN IF NOT EXISTS reviewer_note TEXT;

-- Physically inspected quantity (set by RRA officer, may differ from actualQuantity)
ALTER TABLE import_declaration
  ADD COLUMN IF NOT EXISTS inspected_quantity REAL;

-- Whether a significant discrepancy was detected (>10%)
ALTER TABLE import_declaration
  ADD COLUMN IF NOT EXISTS discrepancy_flag BOOLEAN NOT NULL DEFAULT FALSE;

-- Discrepancy percentage (|expected - inspected| / expected * 100)
ALTER TABLE import_declaration
  ADD COLUMN IF NOT EXISTS discrepancy_pct REAL;

-- Backfill declaration_ref for any existing rows that have none
UPDATE import_declaration
SET declaration_ref = 'DECL-' || UPPER(SUBSTRING(id, 1, 8))
WHERE declaration_ref IS NULL;

-- Index for fast lookup by reference
CREATE INDEX IF NOT EXISTS import_declaration_ref_idx
  ON import_declaration (declaration_ref);

-- Index for discrepancy reports
CREATE INDEX IF NOT EXISTS import_discrepancy_flag_idx
  ON import_declaration (discrepancy_flag)
  WHERE discrepancy_flag = TRUE;