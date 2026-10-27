-- Manufacturer-owned, versioned recipes with protected material identifiers.
-- Confidential names are stored separately from production batch evidence.
BEGIN;

ALTER TABLE public.production_batch
  ADD COLUMN IF NOT EXISTS planned_quantity REAL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'production_batch_planned_quantity_check'
      AND conrelid = 'public.production_batch'::regclass
  ) THEN
    ALTER TABLE public.production_batch
      ADD CONSTRAINT production_batch_planned_quantity_check
      CHECK (planned_quantity IS NULL OR planned_quantity > 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.manufacturing_material (
  id TEXT PRIMARY KEY,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  material_code TEXT NOT NULL,
  confidential_name TEXT NOT NULL,
  unit TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT manufacturing_material_owner_code_uniq UNIQUE (manufacturer_id, material_code),
  CONSTRAINT manufacturing_material_name_check CHECK (length(trim(confidential_name)) BETWEEN 1 AND 160),
  CONSTRAINT manufacturing_material_code_check CHECK (material_code ~ '^M-[0-9]{3,}$')
);
CREATE INDEX IF NOT EXISTS manufacturing_material_owner_idx
  ON public.manufacturing_material (manufacturer_id);

CREATE TABLE IF NOT EXISTS public.manufacturing_recipe (
  id TEXT PRIMARY KEY,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  product_id TEXT NOT NULL REFERENCES public.product(id),
  version INTEGER NOT NULL CHECK (version > 0),
  batch_output_quantity REAL NOT NULL CHECK (batch_output_quantity > 0),
  material_tolerance_percent REAL NOT NULL DEFAULT 5
    CHECK (material_tolerance_percent >= 0 AND material_tolerance_percent <= 100),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT manufacturing_recipe_product_version_uniq UNIQUE (manufacturer_id, product_id, version)
);
CREATE INDEX IF NOT EXISTS manufacturing_recipe_owner_product_idx
  ON public.manufacturing_recipe (manufacturer_id, product_id);

CREATE TABLE IF NOT EXISTS public.manufacturing_recipe_material (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES public.manufacturing_recipe(id),
  material_id TEXT NOT NULL REFERENCES public.manufacturing_material(id),
  planned_quantity REAL NOT NULL CHECK (planned_quantity > 0),
  CONSTRAINT manufacturing_recipe_material_uniq UNIQUE (recipe_id, material_id)
);

CREATE TABLE IF NOT EXISTS public.production_batch_material (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES public.production_batch(id),
  recipe_id TEXT NOT NULL REFERENCES public.manufacturing_recipe(id),
  recipe_material_id TEXT NOT NULL REFERENCES public.manufacturing_recipe_material(id),
  material_id TEXT NOT NULL REFERENCES public.manufacturing_material(id),
  planned_quantity REAL NOT NULL CHECK (planned_quantity > 0),
  actual_quantity REAL NOT NULL CHECK (actual_quantity >= 0),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT production_batch_material_uniq UNIQUE (batch_id, material_id)
);
CREATE INDEX IF NOT EXISTS production_batch_material_batch_idx
  ON public.production_batch_material (batch_id);

CREATE OR REPLACE FUNCTION public.reject_confidential_manufacturing_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'manufacturing formulation records are immutable; create a new version';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS manufacturing_material_immutable ON public.manufacturing_material;
CREATE TRIGGER manufacturing_material_immutable
  BEFORE UPDATE OR DELETE ON public.manufacturing_material
  FOR EACH ROW EXECUTE FUNCTION public.reject_confidential_manufacturing_mutation();

DROP TRIGGER IF EXISTS manufacturing_recipe_immutable ON public.manufacturing_recipe;
CREATE TRIGGER manufacturing_recipe_immutable
  BEFORE UPDATE OR DELETE ON public.manufacturing_recipe
  FOR EACH ROW EXECUTE FUNCTION public.reject_confidential_manufacturing_mutation();

DROP TRIGGER IF EXISTS manufacturing_recipe_material_immutable ON public.manufacturing_recipe_material;
CREATE TRIGGER manufacturing_recipe_material_immutable
  BEFORE UPDATE OR DELETE ON public.manufacturing_recipe_material
  FOR EACH ROW EXECUTE FUNCTION public.reject_confidential_manufacturing_mutation();

DROP TRIGGER IF EXISTS production_batch_material_immutable ON public.production_batch_material;
CREATE TRIGGER production_batch_material_immutable
  BEFORE UPDATE OR DELETE ON public.production_batch_material
  FOR EACH ROW EXECUTE FUNCTION public.reject_confidential_manufacturing_mutation();

COMMIT;
