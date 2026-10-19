-- Immutable inventory movements and historical VAT calculation snapshots.
-- Existing transactions remain NULL because their exact configured rates/mode
-- cannot be reconstructed reliably.
CREATE TABLE IF NOT EXISTS stock_movement (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES "user"(id),
  product_id TEXT NOT NULL REFERENCES product(id),
  quantity_delta REAL NOT NULL,
  quantity_before REAL NOT NULL,
  quantity_after REAL NOT NULL,
  movement_type TEXT NOT NULL,
  source_type TEXT,
  source_id TEXT,
  actor_user_id TEXT REFERENCES "user"(id),
  reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT stock_movement_delta_check CHECK (quantity_delta = quantity_after - quantity_before)
);
CREATE INDEX IF NOT EXISTS stock_movement_business_product_created_idx
  ON stock_movement (business_id, product_id, created_at);
CREATE INDEX IF NOT EXISTS stock_movement_source_idx
  ON stock_movement (source_type, source_id);

CREATE OR REPLACE FUNCTION reject_stock_movement_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'stock_movement rows are immutable';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS stock_movement_immutable ON stock_movement;
CREATE TRIGGER stock_movement_immutable
  BEFORE UPDATE OR DELETE ON stock_movement
  FOR EACH ROW EXECUTE FUNCTION reject_stock_movement_mutation();

ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS vat_rate_basis_points INTEGER;
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS pricing_mode TEXT;
ALTER TABLE "transaction" ADD CONSTRAINT transaction_pricing_mode_check
  CHECK (pricing_mode IS NULL OR pricing_mode IN ('exclusive', 'inclusive'));
ALTER TABLE "transaction" ADD CONSTRAINT transaction_vat_rate_check
  CHECK (vat_rate_basis_points IS NULL OR (vat_rate_basis_points >= 0 AND vat_rate_basis_points <= 100000));
