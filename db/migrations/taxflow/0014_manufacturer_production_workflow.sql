-- Manufacturer production ledger and append-only stock movement history.
-- Run this complete script in the production Neon database (Primary / neondb).
-- It is safe to run again if a previous attempt completed only part of the work.

BEGIN;

CREATE TABLE IF NOT EXISTS public.stock_movement (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES public."user"(id),
  product_id TEXT NOT NULL REFERENCES public.product(id),
  quantity_delta REAL NOT NULL,
  quantity_before REAL NOT NULL,
  quantity_after REAL NOT NULL,
  movement_type TEXT NOT NULL,
  source_type TEXT,
  source_id TEXT,
  actor_user_id TEXT REFERENCES public."user"(id),
  reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stock_movement_delta_check'
      AND conrelid = 'public.stock_movement'::regclass
  ) THEN
    ALTER TABLE public.stock_movement
      ADD CONSTRAINT stock_movement_delta_check
      CHECK (quantity_delta = quantity_after - quantity_before);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS stock_movement_business_product_created_idx
  ON public.stock_movement (business_id, product_id, created_at);
CREATE INDEX IF NOT EXISTS stock_movement_source_idx
  ON public.stock_movement (source_type, source_id);

-- Stock quantities support fractional product units in the application.
ALTER TABLE public.stock
  ALTER COLUMN quantity TYPE REAL USING quantity::REAL;

CREATE OR REPLACE FUNCTION public.reject_stock_movement_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'stock_movement rows are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stock_movement_immutable ON public.stock_movement;
CREATE TRIGGER stock_movement_immutable
  BEFORE UPDATE OR DELETE ON public.stock_movement
  FOR EACH ROW EXECUTE FUNCTION public.reject_stock_movement_mutation();

CREATE TABLE IF NOT EXISTS public.production_batch (
  id TEXT PRIMARY KEY,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  product_id TEXT NOT NULL REFERENCES public.product(id),
  batch_reference TEXT NOT NULL,
  declared_quantity REAL NOT NULL CHECK (declared_quantity > 0),
  opening_stock REAL DEFAULT 0,
  approved_losses REAL DEFAULT 0,
  status TEXT DEFAULT 'declared',
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT production_batch_period_check CHECK (period_end >= period_start)
);

ALTER TABLE public.production_batch
  ADD COLUMN IF NOT EXISTS unit_price INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.production_batch
  ADD COLUMN IF NOT EXISTS vat_rate_basis_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.production_batch
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE INDEX IF NOT EXISTS prod_batch_manufacturer_idx
  ON public.production_batch (manufacturer_id);
CREATE INDEX IF NOT EXISTS prod_batch_product_idx
  ON public.production_batch (product_id);
CREATE INDEX IF NOT EXISTS prod_batch_status_idx
  ON public.production_batch (status);
CREATE UNIQUE INDEX IF NOT EXISTS prod_batch_ref_uniq
  ON public.production_batch (batch_reference);
CREATE UNIQUE INDEX IF NOT EXISTS prod_batch_idempotency_key_uniq
  ON public.production_batch (idempotency_key);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'production_batch_price_check'
      AND conrelid = 'public.production_batch'::regclass
  ) THEN
    ALTER TABLE public.production_batch
      ADD CONSTRAINT production_batch_price_check CHECK (unit_price >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'production_batch_vat_rate_check'
      AND conrelid = 'public.production_batch'::regclass
  ) THEN
    ALTER TABLE public.production_batch
      ADD CONSTRAINT production_batch_vat_rate_check
      CHECK (vat_rate_basis_points >= 0 AND vat_rate_basis_points <= 100000);
  END IF;
END $$;

COMMIT;
