BEGIN;

CREATE TABLE IF NOT EXISTS public.import_intent (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES public."user"(id),
  product_name TEXT NOT NULL,
  planned_quantity REAL NOT NULL,
  purchase_country TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT import_intent_product_name_check
    CHECK (length(trim(product_name)) BETWEEN 1 AND 160),
  CONSTRAINT import_intent_quantity_check CHECK (planned_quantity > 0),
  CONSTRAINT import_intent_purchase_country_check
    CHECK (length(trim(purchase_country)) BETWEEN 1 AND 100)
);

CREATE INDEX IF NOT EXISTS import_intent_business_created_idx
  ON public.import_intent (business_id, created_at DESC);

COMMIT;
