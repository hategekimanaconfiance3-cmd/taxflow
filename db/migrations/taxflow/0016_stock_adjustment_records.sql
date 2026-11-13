-- Product Journey searches approved stock corrections alongside transaction,
-- production, and import records. The application schema already defines this
-- table, but earlier production migrations did not create it.
-- Safe to run more than once.

BEGIN;

CREATE TABLE IF NOT EXISTS public.stock_adjustment (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES public."user"(id),
  product_id TEXT NOT NULL REFERENCES public.product(id),
  adjustment_type TEXT NOT NULL,
  quantity_delta REAL NOT NULL,
  reason TEXT NOT NULL,
  approved_by_id TEXT REFERENCES public."user"(id),
  batch_reference TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stock_adj_business_idx
  ON public.stock_adjustment (business_id);
CREATE INDEX IF NOT EXISTS stock_adj_product_idx
  ON public.stock_adjustment (product_id);
CREATE INDEX IF NOT EXISTS stock_adj_type_idx
  ON public.stock_adjustment (adjustment_type);

COMMIT;
