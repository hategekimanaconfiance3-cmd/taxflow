-- Migration 0036: Change expected_quantity and actual_quantity from INTEGER to REAL
-- Already applied manually to Neon DB
ALTER TABLE import_declaration
  ALTER COLUMN expected_quantity TYPE real USING expected_quantity::real,
  ALTER COLUMN actual_quantity TYPE real USING actual_quantity::real;
