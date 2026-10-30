-- Forward-only finished-goods provenance for independently released batches.
-- Historical stock is intentionally not backfilled with fabricated lot data.
CREATE TABLE IF NOT EXISTS public.production_finished_goods_lot (
  id TEXT PRIMARY KEY,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  product_id TEXT NOT NULL REFERENCES public.product(id),
  production_batch_id TEXT NOT NULL REFERENCES public.production_batch(id),
  stock_movement_id TEXT NOT NULL REFERENCES public.stock_movement(id),
  lot_reference TEXT NOT NULL,
  quantity NUMERIC(24,6) NOT NULL,
  unit TEXT NOT NULL,
  evidence_reference TEXT NOT NULL,
  verified_by_user_id TEXT NOT NULL REFERENCES public."user"(id),
  verified_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT production_finished_goods_lot_quantity_positive CHECK (quantity > 0),
  CONSTRAINT production_finished_goods_lot_evidence_check CHECK (length(trim(evidence_reference)) >= 2),
  CONSTRAINT production_finished_goods_lot_batch_uniq UNIQUE (production_batch_id),
  CONSTRAINT production_finished_goods_lot_movement_uniq UNIQUE (stock_movement_id),
  CONSTRAINT production_finished_goods_lot_manufacturer_ref_uniq UNIQUE (manufacturer_id, lot_reference)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_finished_goods_lot_product_created_idx
  ON public.production_finished_goods_lot (manufacturer_id, product_id, created_at);
--> statement-breakpoint
COMMENT ON TABLE public.production_finished_goods_lot IS
  'Immutable, forward-only lot provenance for good output from independently released production batches.';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.validate_production_finished_goods_lot() RETURNS trigger AS $$
DECLARE
  batch_manufacturer TEXT;
  batch_product TEXT;
  batch_reference TEXT;
  batch_good_quantity NUMERIC;
  batch_review_status TEXT;
  batch_reviewer TEXT;
  batch_reviewed_at TIMESTAMP;
  movement_business TEXT;
  movement_product TEXT;
  movement_delta DOUBLE PRECISION;
  movement_type TEXT;
  movement_source_type TEXT;
  movement_source_id TEXT;
BEGIN
  SELECT b.manufacturer_id, b.product_id, b.batch_reference, b.good_output_quantity,
         b.material_review_status, b.material_reviewed_by_id, b.material_reviewed_at
    INTO batch_manufacturer, batch_product, batch_reference, batch_good_quantity,
         batch_review_status, batch_reviewer, batch_reviewed_at
    FROM public.production_batch AS b WHERE b.id = NEW.production_batch_id;
  IF batch_manufacturer IS NULL OR batch_review_status IS DISTINCT FROM 'released'
    OR batch_good_quantity IS NULL OR batch_good_quantity <= 0
    OR NEW.manufacturer_id IS DISTINCT FROM batch_manufacturer
    OR NEW.product_id IS DISTINCT FROM batch_product
    OR NEW.lot_reference IS DISTINCT FROM batch_reference
    OR NEW.quantity IS DISTINCT FROM batch_good_quantity
    OR NEW.verified_by_user_id IS DISTINCT FROM batch_reviewer
    OR NEW.verified_at IS DISTINCT FROM batch_reviewed_at THEN
    RAISE EXCEPTION 'Finished-goods lot must match independently released good batch output';
  END IF;

  SELECT sm.business_id, sm.product_id, sm.quantity_delta, sm.movement_type, sm.source_type, sm.source_id
    INTO movement_business, movement_product, movement_delta, movement_type, movement_source_type, movement_source_id
    FROM public.stock_movement AS sm WHERE sm.id = NEW.stock_movement_id;
  IF movement_business IS DISTINCT FROM batch_manufacturer
    OR movement_product IS DISTINCT FROM batch_product
    OR movement_delta IS DISTINCT FROM NEW.quantity::DOUBLE PRECISION
    OR movement_type IS DISTINCT FROM 'production'
    OR movement_source_type IS DISTINCT FROM 'production_batch'
    OR movement_source_id IS DISTINCT FROM NEW.production_batch_id THEN
    RAISE EXCEPTION 'Finished-goods lot must link to its matching production stock movement';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS production_finished_goods_lot_validate ON public.production_finished_goods_lot;
--> statement-breakpoint
CREATE TRIGGER production_finished_goods_lot_validate
  BEFORE INSERT ON public.production_finished_goods_lot
  FOR EACH ROW EXECUTE FUNCTION public.validate_production_finished_goods_lot();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reject_production_finished_goods_lot_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Finished-goods lot provenance is immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS production_finished_goods_lot_immutable ON public.production_finished_goods_lot;
--> statement-breakpoint
CREATE TRIGGER production_finished_goods_lot_immutable
  BEFORE UPDATE OR DELETE ON public.production_finished_goods_lot
  FOR EACH ROW EXECUTE FUNCTION public.reject_production_finished_goods_lot_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.require_released_batch_finished_goods_lot() RETURNS trigger AS $$
BEGIN
  IF NEW.material_review_status = 'released'
    AND NEW.good_output_quantity > 0
    AND (TG_OP = 'INSERT' OR OLD.material_review_status IS DISTINCT FROM 'released')
    AND NOT EXISTS (
      SELECT 1 FROM public.production_finished_goods_lot lot
      WHERE lot.production_batch_id = NEW.id
        AND lot.manufacturer_id = NEW.manufacturer_id
        AND lot.product_id = NEW.product_id
        AND lot.quantity = NEW.good_output_quantity
    ) THEN
    RAISE EXCEPTION 'Released good output requires its verified finished-goods lot';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS production_batch_require_finished_goods_lot ON public.production_batch;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER production_batch_require_finished_goods_lot
  AFTER INSERT OR UPDATE ON public.production_batch
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.require_released_batch_finished_goods_lot();
