-- Repair an unapplied customer-directory migration that blocks transaction RETURNING.
-- Existing transactions remain unlinked; this does not backfill customer identities.
BEGIN;

CREATE TABLE IF NOT EXISTS public.customer (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  customer_type TEXT NOT NULL DEFAULT 'individual',
  tin_number TEXT,
  phone TEXT,
  email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_type_check CHECK (customer_type IN ('individual', 'business', 'institution')),
  CONSTRAINT customer_tin_format_check CHECK (tin_number IS NULL OR tin_number ~ '^[0-9]{9}$')
);

CREATE INDEX IF NOT EXISTS customer_business_active_name_idx
  ON public.customer (business_id, is_active, name);
CREATE UNIQUE INDEX IF NOT EXISTS customer_business_tin_uniq
  ON public.customer (business_id, tin_number);

ALTER TABLE public."transaction"
  ADD COLUMN IF NOT EXISTS customer_id TEXT REFERENCES public.customer(id) ON DELETE SET NULL;

COMMIT;
