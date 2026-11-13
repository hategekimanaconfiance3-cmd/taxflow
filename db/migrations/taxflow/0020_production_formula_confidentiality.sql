-- Manufacturer-owned recipe and material data is stored separately from
-- ordinary production batch summaries. Recipe versions and usage evidence are
-- append-only; no existing batch is backfilled with inferred formula data.
CREATE TABLE IF NOT EXISTS public.production_material (
  id TEXT PRIMARY KEY,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  material_code TEXT NOT NULL,
  confidential_name TEXT NOT NULL,
  unit TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT production_material_manufacturer_code_uniq UNIQUE (manufacturer_id, material_code),
  CONSTRAINT production_material_code_nonempty CHECK (length(trim(material_code)) > 0),
  CONSTRAINT production_material_name_nonempty CHECK (length(trim(confidential_name)) > 0),
  CONSTRAINT production_material_unit_nonempty CHECK (length(trim(unit)) > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_material_manufacturer_idx ON public.production_material (manufacturer_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS production_material_manufacturer_name_uniq
  ON public.production_material (manufacturer_id, lower(confidential_name));
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.production_recipe (
  id TEXT PRIMARY KEY,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  product_id TEXT NOT NULL REFERENCES public.product(id),
  recipe_code TEXT NOT NULL,
  version INTEGER NOT NULL,
  output_quantity REAL NOT NULL,
  yield_tolerance_basis_points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by_user_id TEXT NOT NULL REFERENCES public."user"(id),
  CONSTRAINT production_recipe_manufacturer_product_version_uniq UNIQUE (manufacturer_id, product_id, version),
  CONSTRAINT production_recipe_manufacturer_code_version_uniq UNIQUE (manufacturer_id, recipe_code, version),
  CONSTRAINT production_recipe_version_positive CHECK (version > 0),
  CONSTRAINT production_recipe_output_positive CHECK (output_quantity > 0),
  CONSTRAINT production_recipe_tolerance_check CHECK (yield_tolerance_basis_points BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_recipe_manufacturer_product_idx ON public.production_recipe (manufacturer_id, product_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.production_recipe_material (
  id TEXT PRIMARY KEY,
  recipe_version_id TEXT NOT NULL REFERENCES public.production_recipe(id),
  material_id TEXT NOT NULL REFERENCES public.production_material(id),
  quantity REAL NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT production_recipe_material_recipe_material_uniq UNIQUE (recipe_version_id, material_id),
  CONSTRAINT production_recipe_material_quantity_positive CHECK (quantity > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_recipe_material_recipe_idx ON public.production_recipe_material (recipe_version_id);
--> statement-breakpoint

ALTER TABLE public.production_batch
  ADD COLUMN IF NOT EXISTS recipe_version_id TEXT REFERENCES public.production_recipe(id),
  ADD COLUMN IF NOT EXISTS planned_output_quantity REAL,
  ADD COLUMN IF NOT EXISTS production_validation_status TEXT NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS recipe_input_hash TEXT;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'production_batch_production_validation_status_check'
  ) THEN
    ALTER TABLE public.production_batch
      ADD CONSTRAINT production_batch_production_validation_status_check
      CHECK (production_validation_status IN ('not_applicable', 'within_tolerance', 'review_required'));
  END IF;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.production_batch_material_usage (
  id TEXT PRIMARY KEY,
  production_batch_id TEXT NOT NULL REFERENCES public.production_batch(id),
  recipe_material_id TEXT NOT NULL REFERENCES public.production_recipe_material(id),
  material_id TEXT NOT NULL REFERENCES public.production_material(id),
  planned_quantity REAL NOT NULL,
  actual_quantity REAL NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT production_batch_material_usage_batch_line_uniq UNIQUE (production_batch_id, recipe_material_id),
  CONSTRAINT production_batch_material_usage_planned_check CHECK (planned_quantity > 0),
  CONSTRAINT production_batch_material_usage_actual_check CHECK (actual_quantity >= 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_batch_material_usage_batch_idx ON public.production_batch_material_usage (production_batch_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_batch_material_usage_material_idx ON public.production_batch_material_usage (material_id);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.reject_production_formula_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Production formula history is immutable; create a new recipe version';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS production_material_immutable ON public.production_material;
--> statement-breakpoint
CREATE TRIGGER production_material_immutable BEFORE UPDATE OR DELETE ON public.production_material
  FOR EACH ROW EXECUTE FUNCTION public.reject_production_formula_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS production_recipe_immutable ON public.production_recipe;
--> statement-breakpoint
CREATE TRIGGER production_recipe_immutable BEFORE UPDATE OR DELETE ON public.production_recipe
  FOR EACH ROW EXECUTE FUNCTION public.reject_production_formula_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS production_recipe_material_immutable ON public.production_recipe_material;
--> statement-breakpoint
CREATE TRIGGER production_recipe_material_immutable BEFORE UPDATE OR DELETE ON public.production_recipe_material
  FOR EACH ROW EXECUTE FUNCTION public.reject_production_formula_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS production_batch_material_usage_immutable ON public.production_batch_material_usage;
--> statement-breakpoint
CREATE TRIGGER production_batch_material_usage_immutable BEFORE UPDATE OR DELETE ON public.production_batch_material_usage
  FOR EACH ROW EXECUTE FUNCTION public.reject_production_formula_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reject_production_batch_formula_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD.recipe_version_id IS DISTINCT FROM NEW.recipe_version_id
    OR OLD.planned_output_quantity IS DISTINCT FROM NEW.planned_output_quantity
    OR OLD.production_validation_status IS DISTINCT FROM NEW.production_validation_status
    OR OLD.recipe_input_hash IS DISTINCT FROM NEW.recipe_input_hash THEN
    RAISE EXCEPTION 'Production formula evidence is immutable; create a new production record';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS production_batch_formula_evidence_immutable ON public.production_batch;
--> statement-breakpoint
CREATE TRIGGER production_batch_formula_evidence_immutable BEFORE UPDATE ON public.production_batch
  FOR EACH ROW EXECUTE FUNCTION public.reject_production_batch_formula_mutation();
