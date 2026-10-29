-- Confidential raw-material accounting. No legacy balances or batch movements
-- are inferred; verified opening balances must be entered through reviewed receipts.
ALTER TABLE public.import_declaration
  ADD COLUMN IF NOT EXISTS production_material_id TEXT REFERENCES public.production_material(id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.production_material_plan (
  id TEXT PRIMARY KEY,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  product_id TEXT NOT NULL REFERENCES public.product(id),
  recipe_version_id TEXT NOT NULL REFERENCES public.production_recipe(id),
  planned_output_quantity NUMERIC(24,6) NOT NULL CHECK (planned_output_quantity > 0),
  idempotency_key TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES public."user"(id),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT production_material_plan_manufacturer_key_uniq UNIQUE (manufacturer_id, idempotency_key)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_material_plan_manufacturer_created_idx
  ON public.production_material_plan (manufacturer_id, created_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.production_material_plan_line (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES public.production_material_plan(id),
  recipe_material_id TEXT NOT NULL REFERENCES public.production_recipe_material(id),
  material_id TEXT NOT NULL REFERENCES public.production_material(id),
  planned_quantity NUMERIC(24,6) NOT NULL CHECK (planned_quantity > 0),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT production_material_plan_line_uniq UNIQUE (plan_id, recipe_material_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_material_plan_line_material_idx
  ON public.production_material_plan_line (material_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.production_material_receipt (
  id TEXT PRIMARY KEY,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  material_id TEXT NOT NULL REFERENCES public.production_material(id),
  origin TEXT NOT NULL CHECK (origin IN ('import', 'domestic', 'opening_balance')),
  import_declaration_id TEXT REFERENCES public.import_declaration(id),
  transaction_id TEXT REFERENCES public."transaction"(id),
  supplier_reference TEXT,
  evidence_reference TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity NUMERIC(24,6) NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  idempotency_key TEXT NOT NULL,
  submitted_by_user_id TEXT NOT NULL REFERENCES public."user"(id),
  reviewed_by_user_id TEXT REFERENCES public."user"(id),
  reviewed_at TIMESTAMP,
  review_note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT production_material_receipt_owner_key_uniq UNIQUE (manufacturer_id, idempotency_key),
  CONSTRAINT production_material_receipt_source_check CHECK (
    (origin = 'import' AND import_declaration_id IS NOT NULL AND transaction_id IS NULL) OR
    (origin = 'domestic' AND transaction_id IS NOT NULL AND import_declaration_id IS NULL) OR
    (origin = 'opening_balance' AND import_declaration_id IS NULL AND transaction_id IS NULL)
  ),
  CONSTRAINT production_material_receipt_review_pair_check CHECK ((status = 'pending' AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL) OR (status <> 'pending' AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS production_material_receipt_import_uniq
  ON public.production_material_receipt (import_declaration_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_material_receipt_status_created_idx
  ON public.production_material_receipt (status, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_material_receipt_manufacturer_created_idx
  ON public.production_material_receipt (manufacturer_id, created_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.production_material_movement (
  id TEXT PRIMARY KEY,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  material_id TEXT NOT NULL REFERENCES public.production_material(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('receipt', 'consumption', 'adjustment')),
  quantity_delta NUMERIC(24,6) NOT NULL CHECK (quantity_delta <> 0),
  quantity_before NUMERIC(24,6) NOT NULL,
  quantity_after NUMERIC(24,6) NOT NULL,
  receipt_id TEXT REFERENCES public.production_material_receipt(id),
  production_batch_id TEXT REFERENCES public.production_batch(id),
  batch_usage_id TEXT REFERENCES public.production_batch_material_usage(id),
  source_reference TEXT,
  actor_user_id TEXT NOT NULL REFERENCES public."user"(id),
  reason TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT production_material_movement_balance_check CHECK (quantity_after = quantity_before + quantity_delta),
  CONSTRAINT production_material_movement_reference_check CHECK (
    (movement_type = 'receipt' AND receipt_id IS NOT NULL AND production_batch_id IS NULL AND batch_usage_id IS NULL) OR
    (movement_type = 'consumption' AND receipt_id IS NULL AND production_batch_id IS NOT NULL AND batch_usage_id IS NOT NULL) OR
    (movement_type = 'adjustment' AND receipt_id IS NULL AND production_batch_id IS NULL AND batch_usage_id IS NULL AND source_reference IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS production_material_movement_receipt_uniq
  ON public.production_material_movement (receipt_id) WHERE receipt_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS production_material_movement_usage_uniq
  ON public.production_material_movement (batch_usage_id) WHERE batch_usage_id IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS production_material_movement_material_created_idx
  ON public.production_material_movement (manufacturer_id, material_id, created_at);
--> statement-breakpoint

ALTER TABLE public.production_batch
  ADD COLUMN IF NOT EXISTS material_plan_id TEXT REFERENCES public.production_material_plan(id),
  ADD COLUMN IF NOT EXISTS material_review_status TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS material_review_note TEXT,
  ADD COLUMN IF NOT EXISTS material_reviewed_by_id TEXT REFERENCES public."user"(id),
  ADD COLUMN IF NOT EXISTS material_reviewed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS material_posted_at TIMESTAMP;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_batch_material_review_status_check') THEN
    ALTER TABLE public.production_batch ADD CONSTRAINT production_batch_material_review_status_check
      CHECK (material_review_status IN ('not_required', 'pending', 'released', 'rejected'));
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS prod_batch_material_plan_uniq
  ON public.production_batch (material_plan_id) WHERE material_plan_id IS NOT NULL;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.reject_production_material_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Production material accounting evidence is immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS production_material_movement_immutable ON public.production_material_movement;
--> statement-breakpoint
CREATE TRIGGER production_material_movement_immutable BEFORE UPDATE OR DELETE ON public.production_material_movement
  FOR EACH ROW EXECUTE FUNCTION public.reject_production_material_ledger_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS production_material_plan_line_immutable ON public.production_material_plan_line;
--> statement-breakpoint
CREATE TRIGGER production_material_plan_line_immutable BEFORE UPDATE OR DELETE ON public.production_material_plan_line
  FOR EACH ROW EXECUTE FUNCTION public.reject_production_material_ledger_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.guard_production_material_receipt_update() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'pending'
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.manufacturer_id IS DISTINCT FROM OLD.manufacturer_id
    OR NEW.material_id IS DISTINCT FROM OLD.material_id
    OR NEW.origin IS DISTINCT FROM OLD.origin
    OR NEW.import_declaration_id IS DISTINCT FROM OLD.import_declaration_id
    OR NEW.transaction_id IS DISTINCT FROM OLD.transaction_id
    OR NEW.supplier_reference IS DISTINCT FROM OLD.supplier_reference
    OR NEW.evidence_reference IS DISTINCT FROM OLD.evidence_reference
    OR NEW.unit IS DISTINCT FROM OLD.unit
    OR NEW.quantity IS DISTINCT FROM OLD.quantity
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.submitted_by_user_id IS DISTINCT FROM OLD.submitted_by_user_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.status NOT IN ('verified', 'rejected') THEN
    RAISE EXCEPTION 'Material receipt evidence is immutable; submit a correction as a new record';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS production_material_receipt_evidence_guard ON public.production_material_receipt;
--> statement-breakpoint
CREATE TRIGGER production_material_receipt_evidence_guard BEFORE UPDATE ON public.production_material_receipt
  FOR EACH ROW EXECUTE FUNCTION public.guard_production_material_receipt_update();
--> statement-breakpoint
CREATE TRIGGER production_material_receipt_no_delete BEFORE DELETE ON public.production_material_receipt
  FOR EACH ROW EXECUTE FUNCTION public.reject_production_material_ledger_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.guard_production_material_plan_update() RETURNS trigger AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.manufacturer_id IS DISTINCT FROM OLD.manufacturer_id
    OR NEW.product_id IS DISTINCT FROM OLD.product_id
    OR NEW.recipe_version_id IS DISTINCT FROM OLD.recipe_version_id
    OR NEW.planned_output_quantity IS DISTINCT FROM OLD.planned_output_quantity
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NOT ((OLD.status = 'planned' AND NEW.status IN ('in_progress', 'cancelled'))
      OR (OLD.status = 'in_progress' AND NEW.status IN ('completed', 'cancelled'))) THEN
    RAISE EXCEPTION 'Production plan evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS production_material_plan_evidence_guard ON public.production_material_plan;
--> statement-breakpoint
CREATE TRIGGER production_material_plan_evidence_guard BEFORE UPDATE ON public.production_material_plan
  FOR EACH ROW EXECUTE FUNCTION public.guard_production_material_plan_update();
--> statement-breakpoint
CREATE TRIGGER production_material_plan_no_delete BEFORE DELETE ON public.production_material_plan
  FOR EACH ROW EXECUTE FUNCTION public.reject_production_material_ledger_mutation();
