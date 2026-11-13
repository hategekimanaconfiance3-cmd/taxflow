ALTER TABLE public.production_recipe_material
  ADD COLUMN IF NOT EXISTS consumption_tolerance_basis_points INTEGER
  CHECK (consumption_tolerance_basis_points IS NULL OR consumption_tolerance_basis_points BETWEEN 0 AND 10000);
--> statement-breakpoint
ALTER TABLE public.production_batch_material_usage
  ADD COLUMN IF NOT EXISTS consumption_tolerance_basis_points INTEGER
  CHECK (consumption_tolerance_basis_points IS NULL OR consumption_tolerance_basis_points BETWEEN 0 AND 10000);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.production_history_comparison (
  id TEXT PRIMARY KEY,
  production_batch_id TEXT NOT NULL REFERENCES public.production_batch(id),
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  product_id TEXT NOT NULL REFERENCES public.product(id),
  recipe_version_id TEXT REFERENCES public.production_recipe(id),
  rule_version TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT production_history_comparison_snapshot_object_check
    CHECK (jsonb_typeof(snapshot) = 'object')
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS production_history_comparison_batch_uniq
  ON public.production_history_comparison (production_batch_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_history_comparison_manufacturer_created_idx
  ON public.production_history_comparison (manufacturer_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_history_comparison_product_created_idx
  ON public.production_history_comparison (product_id, created_at);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reject_production_history_comparison_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Production history comparison evidence is immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS production_history_comparison_immutable ON public.production_history_comparison;
--> statement-breakpoint
CREATE TRIGGER production_history_comparison_immutable
  BEFORE UPDATE OR DELETE ON public.production_history_comparison
  FOR EACH ROW EXECUTE FUNCTION public.reject_production_history_comparison_mutation();
