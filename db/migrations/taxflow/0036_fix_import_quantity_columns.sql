-- Migration 0036: Fix import_declaration quantity columns from integer to real
-- The original migration created expected_quantity and actual_quantity as INTEGER,
-- but the application sends REAL (float) values for inspected quantities.
-- PostgreSQL 22P02 (invalid_text_representation) occurs when a non-integer float
-- is sent to an INTEGER column via the Drizzle ORM layer.

ALTER TABLE import_declaration
  ALTER COLUMN expected_quantity TYPE REAL USING expected_quantity::REAL;

ALTER TABLE import_declaration
  ALTER COLUMN actual_quantity TYPE REAL USING actual_quantity::REAL;
