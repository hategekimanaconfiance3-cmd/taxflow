-- Forward-only lifecycle evidence for verified finished-goods lots.
-- Legacy aggregate stock is deliberately not assigned to synthetic lots.
CREATE TABLE IF NOT EXISTS public.production_finished_goods_warehouse (
  id TEXT PRIMARY KEY,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES public."user"(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT production_fg_warehouse_manufacturer_code_uniq UNIQUE (manufacturer_id, code)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_fg_warehouse_manufacturer_idx
  ON public.production_finished_goods_warehouse (manufacturer_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.production_finished_goods_movement (
  id TEXT PRIMARY KEY,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  lot_id TEXT NOT NULL REFERENCES public.production_finished_goods_lot(id),
  warehouse_id TEXT NOT NULL REFERENCES public.production_finished_goods_warehouse(id),
  event_type TEXT NOT NULL,
  quantity_delta NUMERIC(24,6) NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  reference TEXT,
  actor_user_id TEXT NOT NULL REFERENCES public."user"(id),
  reason TEXT,
  evidence_reference TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT production_fg_movement_manufacturer_key_uniq UNIQUE (manufacturer_id, idempotency_key),
  CONSTRAINT production_fg_movement_type_check CHECK (event_type IN ('warehouse_assignment', 'dispatch', 'transfer_out', 'transfer_in', 'return_accepted', 'rework_consumed', 'rework_output', 'authorized_correction')),
  CONSTRAINT production_fg_movement_delta_check CHECK (
    (event_type IN ('dispatch', 'transfer_out', 'rework_consumed') AND quantity_delta < 0)
    OR (event_type IN ('warehouse_assignment', 'transfer_in', 'return_accepted', 'rework_output') AND quantity_delta > 0)
    OR (event_type = 'authorized_correction' AND quantity_delta <> 0)
  ),
  CONSTRAINT production_fg_movement_reason_evidence_check CHECK (
    event_type <> 'authorized_correction'
    OR (length(trim(coalesce(reason, ''))) >= 5 AND length(trim(coalesce(evidence_reference, ''))) >= 2)
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_fg_movement_lot_created_idx
  ON public.production_finished_goods_movement (lot_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_fg_movement_source_idx
  ON public.production_finished_goods_movement (source_type, source_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.production_rejected_goods_lot (
  id TEXT PRIMARY KEY,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  product_id TEXT NOT NULL REFERENCES public.product(id),
  production_batch_id TEXT NOT NULL REFERENCES public.production_batch(id),
  lot_reference TEXT NOT NULL,
  quantity NUMERIC(24,6) NOT NULL,
  unit TEXT NOT NULL,
  evidence_reference TEXT NOT NULL,
  verified_by_user_id TEXT NOT NULL REFERENCES public."user"(id),
  verified_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT production_rejected_goods_lot_batch_uniq UNIQUE (production_batch_id),
  CONSTRAINT production_rejected_goods_lot_manufacturer_ref_uniq UNIQUE (manufacturer_id, lot_reference),
  CONSTRAINT production_rejected_goods_lot_quantity_positive CHECK (quantity > 0),
  CONSTRAINT production_rejected_goods_lot_evidence_check CHECK (length(trim(evidence_reference)) >= 2)
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.validate_production_rejected_goods_lot() RETURNS trigger AS $$
DECLARE
  batch_manufacturer TEXT;
  batch_product TEXT;
  batch_reference TEXT;
  rejected_quantity NUMERIC;
  batch_review_status TEXT;
  batch_reviewer TEXT;
  batch_reviewed_at TIMESTAMP;
BEGIN
  SELECT b.manufacturer_id, b.product_id, b.batch_reference, b.rejected_output_quantity,
         b.material_review_status, b.material_reviewed_by_id, b.material_reviewed_at
    INTO batch_manufacturer, batch_product, batch_reference, rejected_quantity,
         batch_review_status, batch_reviewer, batch_reviewed_at
    FROM public.production_batch AS b WHERE b.id = NEW.production_batch_id;
  IF batch_manufacturer IS DISTINCT FROM NEW.manufacturer_id
    OR batch_product IS DISTINCT FROM NEW.product_id
    OR batch_review_status IS DISTINCT FROM 'released'
    OR rejected_quantity IS NULL OR rejected_quantity <= 0
    OR NEW.quantity IS DISTINCT FROM rejected_quantity
    OR NEW.lot_reference IS DISTINCT FROM batch_reference || '-REJ'
    OR NEW.verified_by_user_id IS DISTINCT FROM batch_reviewer
    OR NEW.verified_at IS DISTINCT FROM batch_reviewed_at THEN
    RAISE EXCEPTION 'Rejected-goods lot must match independently released rejected batch output';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS production_rejected_goods_lot_validate ON public.production_rejected_goods_lot;
--> statement-breakpoint
CREATE TRIGGER production_rejected_goods_lot_validate BEFORE INSERT ON public.production_rejected_goods_lot
  FOR EACH ROW EXECUTE FUNCTION public.validate_production_rejected_goods_lot();
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_rejected_goods_lot_manufacturer_product_idx
  ON public.production_rejected_goods_lot (manufacturer_id, product_id, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.production_finished_goods_allocation (
  id TEXT PRIMARY KEY,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  lot_id TEXT NOT NULL REFERENCES public.production_finished_goods_lot(id),
  transaction_id TEXT NOT NULL REFERENCES public."transaction"(id),
  quantity NUMERIC(24,6) NOT NULL,
  idempotency_key TEXT NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES public."user"(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT production_fg_allocation_manufacturer_key_uniq UNIQUE (manufacturer_id, idempotency_key),
  CONSTRAINT production_fg_allocation_quantity_check CHECK (quantity > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_fg_allocation_lot_created_idx
  ON public.production_finished_goods_allocation (lot_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_fg_allocation_transaction_idx
  ON public.production_finished_goods_allocation (transaction_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.production_finished_goods_allocation_event (
  id TEXT PRIMARY KEY,
  allocation_id TEXT NOT NULL REFERENCES public.production_finished_goods_allocation(id),
  event_type TEXT NOT NULL,
  quantity NUMERIC(24,6) NOT NULL CHECK (quantity > 0),
  actor_user_id TEXT NOT NULL REFERENCES public."user"(id),
  reference TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT production_fg_allocation_event_type_check CHECK (event_type IN ('reserved', 'cancelled', 'dispatched')),
  CONSTRAINT production_fg_allocation_event_quantity_check CHECK (quantity > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_fg_allocation_event_allocation_idx
  ON public.production_finished_goods_allocation_event (allocation_id, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.production_finished_goods_return (
  id TEXT PRIMARY KEY,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  lot_id TEXT NOT NULL REFERENCES public.production_finished_goods_lot(id),
  transaction_id TEXT NOT NULL REFERENCES public."transaction"(id),
  return_reference TEXT NOT NULL,
  quantity NUMERIC(24,6) NOT NULL,
  reason TEXT NOT NULL,
  evidence_reference TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES public."user"(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT production_fg_return_manufacturer_key_uniq UNIQUE (manufacturer_id, idempotency_key),
  CONSTRAINT production_fg_return_manufacturer_ref_uniq UNIQUE (manufacturer_id, return_reference),
  CONSTRAINT production_fg_return_quantity_check CHECK (quantity > 0),
  CONSTRAINT production_fg_return_evidence_check CHECK (length(trim(evidence_reference)) >= 2 AND length(trim(reason)) >= 5)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_fg_return_lot_created_idx
  ON public.production_finished_goods_return (lot_id, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.production_finished_goods_return_inspection (
  id TEXT PRIMARY KEY,
  return_id TEXT NOT NULL UNIQUE REFERENCES public.production_finished_goods_return(id),
  warehouse_id TEXT NOT NULL REFERENCES public.production_finished_goods_warehouse(id),
  decision TEXT NOT NULL,
  accepted_quantity NUMERIC(24,6) NOT NULL DEFAULT 0,
  rejected_quantity NUMERIC(24,6) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  evidence_reference TEXT NOT NULL,
  inspector_user_id TEXT NOT NULL REFERENCES public."user"(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT production_fg_return_inspection_decision_check CHECK (decision IN ('accepted', 'rejected', 'partial')),
  CONSTRAINT production_fg_return_inspection_quantities_check CHECK (accepted_quantity >= 0 AND rejected_quantity >= 0),
  CONSTRAINT production_fg_return_inspection_decision_quantity_check CHECK (
    (decision = 'accepted' AND rejected_quantity = 0)
    OR (decision = 'rejected' AND accepted_quantity = 0)
    OR (decision = 'partial' AND accepted_quantity > 0 AND rejected_quantity > 0)
  ),
  CONSTRAINT production_fg_return_inspection_reason_check CHECK (length(trim(reason)) >= 5 AND length(trim(evidence_reference)) >= 2)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.production_finished_goods_rework (
  id TEXT PRIMARY KEY,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  source_rejected_lot_id TEXT NOT NULL REFERENCES public.production_rejected_goods_lot(id),
  source_batch_id TEXT NOT NULL REFERENCES public.production_batch(id),
  quantity NUMERIC(24,6) NOT NULL,
  reason TEXT NOT NULL,
  evidence_reference TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES public."user"(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT production_fg_rework_manufacturer_key_uniq UNIQUE (manufacturer_id, idempotency_key),
  CONSTRAINT production_fg_rework_quantity_check CHECK (quantity > 0),
  CONSTRAINT production_fg_rework_evidence_check CHECK (length(trim(reason)) >= 5 AND length(trim(evidence_reference)) >= 2)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_fg_rework_source_rejected_lot_idx
  ON public.production_finished_goods_rework (source_rejected_lot_id, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.production_finished_goods_rework_decision (
  id TEXT PRIMARY KEY,
  rework_id TEXT NOT NULL UNIQUE REFERENCES public.production_finished_goods_rework(id),
  decision TEXT NOT NULL,
  reason TEXT NOT NULL,
  reviewer_user_id TEXT NOT NULL REFERENCES public."user"(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT production_fg_rework_decision_check CHECK (decision IN ('approved', 'rejected')),
  CONSTRAINT production_fg_rework_decision_reason_check CHECK (length(trim(reason)) >= 5)
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.guard_finished_goods_lifecycle_scope() RETURNS trigger AS $$
DECLARE
  lot_manufacturer TEXT;
  warehouse_manufacturer TEXT;
  rejected_lot_batch TEXT;
BEGIN
  IF TG_TABLE_NAME = 'production_finished_goods_warehouse' THEN
    IF NEW.manufacturer_id IS DISTINCT FROM NEW.created_by_user_id THEN
      RAISE EXCEPTION 'Finished-goods warehouse must be created by its manufacturer account';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'production_finished_goods_movement' THEN
    SELECT manufacturer_id INTO lot_manufacturer FROM public.production_finished_goods_lot WHERE id = NEW.lot_id;
    SELECT manufacturer_id INTO warehouse_manufacturer FROM public.production_finished_goods_warehouse WHERE id = NEW.warehouse_id;
    IF lot_manufacturer IS DISTINCT FROM NEW.manufacturer_id OR warehouse_manufacturer IS DISTINCT FROM NEW.manufacturer_id THEN
      RAISE EXCEPTION 'Finished-goods movement crosses manufacturer scope';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'production_rejected_goods_lot' THEN
    SELECT manufacturer_id INTO lot_manufacturer FROM public.production_batch WHERE id = NEW.production_batch_id;
    IF lot_manufacturer IS DISTINCT FROM NEW.manufacturer_id THEN
      RAISE EXCEPTION 'Rejected-goods lot crosses manufacturer scope';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'production_finished_goods_allocation' THEN
    SELECT manufacturer_id INTO lot_manufacturer FROM public.production_finished_goods_lot WHERE id = NEW.lot_id;
    IF lot_manufacturer IS DISTINCT FROM NEW.manufacturer_id THEN
      RAISE EXCEPTION 'Finished-goods allocation crosses manufacturer scope';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'production_finished_goods_return' THEN
    SELECT manufacturer_id INTO lot_manufacturer FROM public.production_finished_goods_lot WHERE id = NEW.lot_id;
    IF lot_manufacturer IS DISTINCT FROM NEW.manufacturer_id THEN
      RAISE EXCEPTION 'Finished-goods return crosses manufacturer scope';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'production_finished_goods_rework' THEN
    SELECT manufacturer_id, production_batch_id INTO lot_manufacturer, rejected_lot_batch
      FROM public.production_rejected_goods_lot WHERE id = NEW.source_rejected_lot_id;
    IF lot_manufacturer IS DISTINCT FROM NEW.manufacturer_id OR rejected_lot_batch IS DISTINCT FROM NEW.source_batch_id THEN
      RAISE EXCEPTION 'Finished-goods rework must match its source rejected lot and batch';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reject_finished_goods_lifecycle_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Finished-goods lifecycle evidence is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'production_finished_goods_warehouse', 'production_finished_goods_movement', 'production_rejected_goods_lot',
    'production_finished_goods_allocation', 'production_finished_goods_allocation_event',
    'production_finished_goods_return', 'production_finished_goods_return_inspection',
    'production_finished_goods_rework', 'production_finished_goods_rework_decision'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_immutable ON public.%I', table_name, table_name);
    EXECUTE format('CREATE TRIGGER %I_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.reject_finished_goods_lifecycle_mutation()', table_name, table_name);
  END LOOP;
END $$;
--> statement-breakpoint
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'production_finished_goods_warehouse', 'production_finished_goods_movement', 'production_rejected_goods_lot',
    'production_finished_goods_allocation', 'production_finished_goods_return', 'production_finished_goods_rework'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_scope_guard ON public.%I', table_name, table_name);
    EXECUTE format('CREATE TRIGGER %I_scope_guard BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_finished_goods_lifecycle_scope()', table_name, table_name);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.require_released_batch_rejected_goods_lot() RETURNS trigger AS $$
BEGIN
  IF NEW.material_review_status = 'released'
    AND NEW.rejected_output_quantity > 0
    AND (TG_OP = 'INSERT' OR OLD.material_review_status IS DISTINCT FROM 'released')
    AND NOT EXISTS (
      SELECT 1 FROM public.production_rejected_goods_lot lot
      WHERE lot.production_batch_id = NEW.id
        AND lot.manufacturer_id = NEW.manufacturer_id
        AND lot.product_id = NEW.product_id
        AND lot.quantity = NEW.rejected_output_quantity
    ) THEN
    RAISE EXCEPTION 'Released rejected output requires its verified rejected-goods lot';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS production_batch_require_rejected_goods_lot ON public.production_batch;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER production_batch_require_rejected_goods_lot
  AFTER INSERT OR UPDATE ON public.production_batch
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.require_released_batch_rejected_goods_lot();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reject_rejected_goods_lot_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Rejected-goods lot provenance is immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS production_rejected_goods_lot_immutable ON public.production_rejected_goods_lot;
--> statement-breakpoint
CREATE TRIGGER production_rejected_goods_lot_immutable BEFORE UPDATE OR DELETE ON public.production_rejected_goods_lot
  FOR EACH ROW EXECUTE FUNCTION public.reject_rejected_goods_lot_mutation();
