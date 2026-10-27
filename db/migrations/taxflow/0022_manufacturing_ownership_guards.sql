-- Enforce manufacturer ownership at the database boundary as well as in services.
BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_production_batch_owner()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.product p
    WHERE p.id = NEW.product_id AND p.created_by_user_id = NEW.manufacturer_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'production product must belong to its manufacturer';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS production_batch_owner_guard ON public.production_batch;
CREATE TRIGGER production_batch_owner_guard
  BEFORE INSERT OR UPDATE ON public.production_batch
  FOR EACH ROW EXECUTE FUNCTION public.enforce_production_batch_owner();

CREATE OR REPLACE FUNCTION public.enforce_manufacturing_recipe_owner()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.product p
    WHERE p.id = NEW.product_id AND p.created_by_user_id = NEW.manufacturer_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'recipe product must belong to its manufacturer';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS manufacturing_recipe_owner_guard ON public.manufacturing_recipe;
CREATE TRIGGER manufacturing_recipe_owner_guard
  BEFORE INSERT OR UPDATE ON public.manufacturing_recipe
  FOR EACH ROW EXECUTE FUNCTION public.enforce_manufacturing_recipe_owner();

CREATE OR REPLACE FUNCTION public.enforce_manufacturing_recipe_material_owner()
RETURNS trigger AS $$
DECLARE
  recipe_owner TEXT;
  material_owner TEXT;
BEGIN
  SELECT r.manufacturer_id, m.manufacturer_id
    INTO recipe_owner, material_owner
  FROM public.manufacturing_recipe r
  CROSS JOIN public.manufacturing_material m
  WHERE r.id = NEW.recipe_id AND m.id = NEW.material_id;

  IF recipe_owner IS NULL OR material_owner IS NULL OR recipe_owner <> material_owner THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'recipe materials must belong to the recipe manufacturer';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS manufacturing_recipe_material_owner_guard ON public.manufacturing_recipe_material;
CREATE TRIGGER manufacturing_recipe_material_owner_guard
  BEFORE INSERT OR UPDATE ON public.manufacturing_recipe_material
  FOR EACH ROW EXECUTE FUNCTION public.enforce_manufacturing_recipe_material_owner();

CREATE OR REPLACE FUNCTION public.enforce_production_batch_material_owner()
RETURNS trigger AS $$
DECLARE
  batch_owner TEXT;
  batch_product TEXT;
  recipe_owner TEXT;
  recipe_product TEXT;
  line_recipe TEXT;
  line_material TEXT;
  material_owner TEXT;
BEGIN
  SELECT b.manufacturer_id, b.product_id, r.manufacturer_id, r.product_id, rm.recipe_id, rm.material_id, m.manufacturer_id
    INTO batch_owner, batch_product, recipe_owner, recipe_product, line_recipe, line_material, material_owner
  FROM public.production_batch b
  CROSS JOIN public.manufacturing_recipe r
  CROSS JOIN public.manufacturing_recipe_material rm
  CROSS JOIN public.manufacturing_material m
  WHERE b.id = NEW.batch_id
    AND r.id = NEW.recipe_id
    AND rm.id = NEW.recipe_material_id
    AND m.id = NEW.material_id;

  IF batch_owner IS NULL OR recipe_owner IS NULL OR line_material IS NULL OR material_owner IS NULL
    OR batch_owner <> recipe_owner OR batch_product <> recipe_product
    OR line_material <> NEW.material_id OR material_owner <> recipe_owner
    OR line_recipe <> NEW.recipe_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'production material evidence must match the batch manufacturer and recipe';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS production_batch_material_owner_guard ON public.production_batch_material;
CREATE TRIGGER production_batch_material_owner_guard
  BEFORE INSERT OR UPDATE ON public.production_batch_material
  FOR EACH ROW EXECUTE FUNCTION public.enforce_production_batch_material_owner();

COMMIT;
