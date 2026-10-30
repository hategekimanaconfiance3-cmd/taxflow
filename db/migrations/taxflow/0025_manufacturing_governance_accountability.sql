-- Super Admin-owned immutable manufacturing standards and additive lifecycle
-- evidence. Existing batches, movements, receipts, and snapshots are untouched.
ALTER TABLE public.production_material_receipt
  ADD COLUMN IF NOT EXISTS lot_reference TEXT;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.production_tolerance_standard (
  id TEXT PRIMARY KEY,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  product_id TEXT NOT NULL REFERENCES public.product(id),
  recipe_version_id TEXT NOT NULL REFERENCES public.production_recipe(id),
  material_id TEXT REFERENCES public.production_material(id),
  tolerance_type TEXT NOT NULL CHECK (tolerance_type IN ('yield', 'material_consumption')),
  version INTEGER NOT NULL CHECK (version > 0),
  tolerance_basis_points INTEGER NOT NULL CHECK (tolerance_basis_points BETWEEN 0 AND 10000),
  tolerance_unit TEXT NOT NULL DEFAULT 'basis_points' CHECK (tolerance_unit = 'basis_points'),
  effective_at TIMESTAMP NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'active', 'inactive')),
  justification TEXT NOT NULL CHECK (length(trim(justification)) >= 10),
  evidence_reference TEXT NOT NULL CHECK (length(trim(evidence_reference)) >= 2),
  created_by_user_id TEXT NOT NULL REFERENCES public."user"(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  approved_by_user_id TEXT REFERENCES public."user"(id),
  approved_at TIMESTAMP,
  approval_note TEXT,
  activated_by_user_id TEXT REFERENCES public."user"(id),
  activated_at TIMESTAMP,
  activation_note TEXT,
  deactivated_by_user_id TEXT REFERENCES public."user"(id),
  deactivated_at TIMESTAMP,
  deactivation_note TEXT,
  CONSTRAINT production_tolerance_standard_scope_check CHECK (
    (tolerance_type = 'yield' AND material_id IS NULL) OR
    (tolerance_type = 'material_consumption' AND material_id IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS production_tolerance_standard_yield_version_uniq
  ON public.production_tolerance_standard (manufacturer_id, product_id, recipe_version_id, version)
  WHERE tolerance_type = 'yield' AND material_id IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS production_tolerance_standard_material_version_uniq
  ON public.production_tolerance_standard (manufacturer_id, product_id, recipe_version_id, material_id, version)
  WHERE tolerance_type = 'material_consumption' AND material_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_tolerance_standard_scope_effective_idx
  ON public.production_tolerance_standard (manufacturer_id, product_id, recipe_version_id, tolerance_type, effective_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_tolerance_standard_status_created_idx
  ON public.production_tolerance_standard (status, created_at);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.is_active_production_tolerance_super_admin(staff_user_id TEXT) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.rra_staff staff
    JOIN public."user" u ON u.id = staff.user_id
    WHERE staff.user_id = staff_user_id
      AND staff.is_active = TRUE
      AND u.is_active = TRUE
      AND (
        EXISTS (SELECT 1 FROM public.rra_staff_role sr WHERE sr.staff_record_id = staff.id AND sr.role = 'super_admin')
        OR (NOT EXISTS (SELECT 1 FROM public.rra_staff_role sr WHERE sr.staff_record_id = staff.id) AND staff.clearance_level = 'super_admin')
      )
  );
END;
$$ LANGUAGE plpgsql STABLE;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.guard_production_tolerance_standard() RETURNS trigger AS $$
DECLARE
  recipe_owner TEXT;
  recipe_product TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_active_production_tolerance_super_admin(NEW.created_by_user_id) THEN
      RAISE EXCEPTION 'Only an active Super Admin may create official tolerance versions';
    END IF;
    SELECT manufacturer_id, product_id INTO recipe_owner, recipe_product
      FROM public.production_recipe WHERE id = NEW.recipe_version_id;
    IF recipe_owner IS DISTINCT FROM NEW.manufacturer_id OR recipe_product IS DISTINCT FROM NEW.product_id THEN
      RAISE EXCEPTION 'Tolerance scope does not match its recipe owner and product';
    END IF;
    IF NEW.material_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.production_recipe_material prm
      JOIN public.production_material pm ON pm.id = prm.material_id
      WHERE prm.recipe_version_id = NEW.recipe_version_id
        AND prm.material_id = NEW.material_id
        AND pm.manufacturer_id = NEW.manufacturer_id
    ) THEN
      RAISE EXCEPTION 'Tolerance material is not part of the scoped recipe';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.manufacturer_id IS DISTINCT FROM OLD.manufacturer_id
    OR NEW.product_id IS DISTINCT FROM OLD.product_id
    OR NEW.recipe_version_id IS DISTINCT FROM OLD.recipe_version_id
    OR NEW.material_id IS DISTINCT FROM OLD.material_id
    OR NEW.tolerance_type IS DISTINCT FROM OLD.tolerance_type
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.tolerance_basis_points IS DISTINCT FROM OLD.tolerance_basis_points
    OR NEW.tolerance_unit IS DISTINCT FROM OLD.tolerance_unit
    OR NEW.effective_at IS DISTINCT FROM OLD.effective_at
    OR NEW.justification IS DISTINCT FROM OLD.justification
    OR NEW.evidence_reference IS DISTINCT FROM OLD.evidence_reference
    OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Tolerance version values are immutable; create a new version';
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'approved'
    AND public.is_active_production_tolerance_super_admin(NEW.approved_by_user_id)
    AND NEW.approved_by_user_id IS NOT NULL AND NEW.approved_at IS NOT NULL
    AND NEW.approval_note IS NOT NULL
    AND NEW.activated_by_user_id IS NOT DISTINCT FROM OLD.activated_by_user_id
    AND NEW.activated_at IS NOT DISTINCT FROM OLD.activated_at
    AND NEW.activation_note IS NOT DISTINCT FROM OLD.activation_note
    AND NEW.deactivated_by_user_id IS NOT DISTINCT FROM OLD.deactivated_by_user_id
    AND NEW.deactivated_at IS NOT DISTINCT FROM OLD.deactivated_at
    AND NEW.deactivation_note IS NOT DISTINCT FROM OLD.deactivation_note THEN
    RETURN NEW;
  ELSIF OLD.status = 'approved' AND NEW.status = 'active'
    AND public.is_active_production_tolerance_super_admin(NEW.activated_by_user_id)
    AND NEW.approved_by_user_id IS NOT DISTINCT FROM OLD.approved_by_user_id
    AND NEW.approved_at IS NOT DISTINCT FROM OLD.approved_at
    AND NEW.approval_note IS NOT DISTINCT FROM OLD.approval_note
    AND NEW.activated_by_user_id IS NOT NULL AND NEW.activated_at IS NOT NULL
    AND NEW.activation_note IS NOT NULL
    AND NEW.deactivated_by_user_id IS NOT DISTINCT FROM OLD.deactivated_by_user_id
    AND NEW.deactivated_at IS NOT DISTINCT FROM OLD.deactivated_at
    AND NEW.deactivation_note IS NOT DISTINCT FROM OLD.deactivation_note THEN
    RETURN NEW;
  ELSIF OLD.status = 'active' AND NEW.status = 'inactive'
    AND public.is_active_production_tolerance_super_admin(NEW.deactivated_by_user_id)
    AND NEW.approved_by_user_id IS NOT DISTINCT FROM OLD.approved_by_user_id
    AND NEW.approved_at IS NOT DISTINCT FROM OLD.approved_at
    AND NEW.approval_note IS NOT DISTINCT FROM OLD.approval_note
    AND NEW.activated_by_user_id IS NOT DISTINCT FROM OLD.activated_by_user_id
    AND NEW.activated_at IS NOT DISTINCT FROM OLD.activated_at
    AND NEW.activation_note IS NOT DISTINCT FROM OLD.activation_note
    AND NEW.deactivated_by_user_id IS NOT NULL AND NEW.deactivated_at IS NOT NULL
    AND NEW.deactivation_note IS NOT NULL THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid tolerance version lifecycle transition';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS production_tolerance_standard_guard ON public.production_tolerance_standard;
--> statement-breakpoint
CREATE TRIGGER production_tolerance_standard_guard
  BEFORE INSERT OR UPDATE ON public.production_tolerance_standard
  FOR EACH ROW EXECUTE FUNCTION public.guard_production_tolerance_standard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reject_production_tolerance_standard_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Tolerance versions are retained for audit history';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS production_tolerance_standard_no_delete ON public.production_tolerance_standard;
--> statement-breakpoint
CREATE TRIGGER production_tolerance_standard_no_delete
  BEFORE DELETE ON public.production_tolerance_standard
  FOR EACH ROW EXECUTE FUNCTION public.reject_production_tolerance_standard_delete();
--> statement-breakpoint

ALTER TABLE public.production_batch
  ADD COLUMN IF NOT EXISTS reported_good_output_quantity NUMERIC(24,6),
  ADD COLUMN IF NOT EXISTS reported_rejected_output_quantity NUMERIC(24,6),
  ADD COLUMN IF NOT EXISTS good_output_quantity NUMERIC(24,6),
  ADD COLUMN IF NOT EXISTS rejected_output_quantity NUMERIC(24,6),
  ADD COLUMN IF NOT EXISTS yield_tolerance_standard_id TEXT REFERENCES public.production_tolerance_standard(id);
--> statement-breakpoint
ALTER TABLE public.production_batch_material_usage
  ADD COLUMN IF NOT EXISTS consumption_tolerance_standard_id TEXT REFERENCES public.production_tolerance_standard(id),
  ADD COLUMN IF NOT EXISTS waste_quantity NUMERIC(24,6);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_batch_output_pair_check') THEN
    ALTER TABLE public.production_batch ADD CONSTRAINT production_batch_output_pair_check CHECK (
      (good_output_quantity IS NULL AND rejected_output_quantity IS NULL) OR
      (good_output_quantity IS NOT NULL AND rejected_output_quantity IS NOT NULL
        AND good_output_quantity >= 0 AND rejected_output_quantity >= 0)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_batch_reported_output_pair_check') THEN
    ALTER TABLE public.production_batch ADD CONSTRAINT production_batch_reported_output_pair_check CHECK (
      (reported_good_output_quantity IS NULL AND reported_rejected_output_quantity IS NULL) OR
      (reported_good_output_quantity IS NOT NULL AND reported_rejected_output_quantity IS NOT NULL
        AND reported_good_output_quantity >= 0 AND reported_rejected_output_quantity >= 0)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_batch_usage_waste_nonnegative_check') THEN
    ALTER TABLE public.production_batch_material_usage ADD CONSTRAINT production_batch_usage_waste_nonnegative_check
      CHECK (waste_quantity IS NULL OR waste_quantity >= 0);
  END IF;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.production_material_reservation (
  id TEXT PRIMARY KEY,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  plan_id TEXT NOT NULL REFERENCES public.production_material_plan(id),
  plan_line_id TEXT NOT NULL REFERENCES public.production_material_plan_line(id),
  material_id TEXT NOT NULL REFERENCES public.production_material(id),
  reserved_quantity NUMERIC(24,6) NOT NULL CHECK (reserved_quantity > 0),
  consumed_quantity NUMERIC(24,6) NOT NULL DEFAULT 0 CHECK (consumed_quantity >= 0 AND consumed_quantity <= reserved_quantity),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'consumed', 'released')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP,
  resolved_by_user_id TEXT REFERENCES public."user"(id),
  resolution_note TEXT,
  CONSTRAINT production_material_reservation_plan_line_uniq UNIQUE (plan_id, plan_line_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_material_reservation_material_status_idx
  ON public.production_material_reservation (manufacturer_id, material_id, status);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.validate_production_material_reservation_scope() RETURNS trigger AS $$
DECLARE
  plan_owner TEXT;
  line_plan TEXT;
  line_material TEXT;
BEGIN
  SELECT manufacturer_id INTO plan_owner FROM public.production_material_plan WHERE id = NEW.plan_id;
  SELECT plan_id, material_id INTO line_plan, line_material FROM public.production_material_plan_line WHERE id = NEW.plan_line_id;
  IF plan_owner IS DISTINCT FROM NEW.manufacturer_id
    OR line_plan IS DISTINCT FROM NEW.plan_id
    OR line_material IS DISTINCT FROM NEW.material_id
    OR NOT EXISTS (SELECT 1 FROM public.production_material WHERE id = NEW.material_id AND manufacturer_id = NEW.manufacturer_id) THEN
    RAISE EXCEPTION 'Production material reservation scope is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS production_material_reservation_scope_guard ON public.production_material_reservation;
--> statement-breakpoint
CREATE TRIGGER production_material_reservation_scope_guard
  BEFORE INSERT ON public.production_material_reservation
  FOR EACH ROW EXECUTE FUNCTION public.validate_production_material_reservation_scope();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.guard_production_material_reservation_update() RETURNS trigger AS $$
DECLARE
  expected_consumption NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Reservation evidence is retained for audit history';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.manufacturer_id IS DISTINCT FROM OLD.manufacturer_id
    OR NEW.plan_id IS DISTINCT FROM OLD.plan_id
    OR NEW.plan_line_id IS DISTINCT FROM OLD.plan_line_id
    OR NEW.material_id IS DISTINCT FROM OLD.material_id
    OR NEW.reserved_quantity IS DISTINCT FROM OLD.reserved_quantity
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Reservation evidence is immutable';
  END IF;
  IF OLD.status = 'active' AND NEW.status IN ('consumed', 'released')
    AND NEW.resolved_at IS NOT NULL AND NEW.resolved_by_user_id IS NOT NULL
    AND NEW.resolution_note IS NOT NULL THEN
    IF NEW.status = 'released' AND NEW.consumed_quantity <> 0 THEN
      RAISE EXCEPTION 'Released reservations cannot post material consumption';
    END IF;
    IF NEW.status = 'consumed' THEN
      SELECT round(COALESCE(SUM(u.actual_quantity::numeric), 0), 6) INTO expected_consumption
        FROM public.production_batch b
        JOIN public.production_batch_material_usage u ON u.production_batch_id = b.id
        WHERE b.material_plan_id = NEW.plan_id AND u.material_id = NEW.material_id;
      IF NEW.consumed_quantity IS DISTINCT FROM expected_consumption THEN
        RAISE EXCEPTION 'Reservation consumed quantity must match recorded batch usage';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invalid material reservation lifecycle transition';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS production_material_reservation_guard ON public.production_material_reservation;
--> statement-breakpoint
CREATE TRIGGER production_material_reservation_guard
  BEFORE UPDATE OR DELETE ON public.production_material_reservation
  FOR EACH ROW EXECUTE FUNCTION public.guard_production_material_reservation_update();
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.production_material_usage_receipt_allocation (
  id TEXT PRIMARY KEY,
  batch_usage_id TEXT NOT NULL REFERENCES public.production_batch_material_usage(id),
  consumption_movement_id TEXT NOT NULL REFERENCES public.production_material_movement(id),
  source_movement_id TEXT NOT NULL REFERENCES public.production_material_movement(id),
  quantity NUMERIC(24,6) NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT production_material_usage_receipt_allocation_uniq UNIQUE (batch_usage_id, source_movement_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_material_usage_receipt_allocation_source_idx
  ON public.production_material_usage_receipt_allocation (source_movement_id);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.guard_production_material_usage_source_allocation() RETURNS trigger AS $$
DECLARE
  usage_material TEXT;
  usage_manufacturer TEXT;
  movement_material TEXT;
  movement_manufacturer TEXT;
  movement_type TEXT;
  source_receipt_status TEXT;
  source_total NUMERIC;
  consumed_total NUMERIC;
  source_quantity NUMERIC;
  consumed_quantity NUMERIC;
BEGIN
  SELECT u.material_id, b.manufacturer_id INTO usage_material, usage_manufacturer
    FROM public.production_batch_material_usage u
    JOIN public.production_batch b ON b.id = u.production_batch_id
    WHERE u.id = NEW.batch_usage_id;
  SELECT m.material_id, m.manufacturer_id, m.movement_type, r.status, m.quantity_delta
    INTO movement_material, movement_manufacturer, movement_type, source_receipt_status, source_quantity
    FROM public.production_material_movement m
    LEFT JOIN public.production_material_receipt r ON r.id = m.receipt_id
    WHERE m.id = NEW.source_movement_id;
  IF usage_material IS NULL OR usage_manufacturer IS DISTINCT FROM movement_manufacturer
    OR usage_material IS DISTINCT FROM movement_material
    OR movement_type NOT IN ('receipt', 'adjustment') OR source_quantity <= 0 THEN
    RAISE EXCEPTION 'Material source allocation scope is invalid';
  END IF;
  IF movement_type = 'receipt' AND source_receipt_status IS DISTINCT FROM 'verified' THEN
    RAISE EXCEPTION 'Only verified receipt movements may supply material consumption';
  END IF;
  SELECT m.movement_type, abs(m.quantity_delta) INTO movement_type, consumed_quantity
    FROM public.production_material_movement m
    WHERE m.id = NEW.consumption_movement_id
      AND m.batch_usage_id = NEW.batch_usage_id
      AND m.movement_type = 'consumption'
      AND m.quantity_delta < 0;
  IF movement_type IS DISTINCT FROM 'consumption' THEN
    RAISE EXCEPTION 'Consumption movement does not match material usage';
  END IF;
  SELECT COALESCE(SUM(quantity), 0) INTO source_total FROM public.production_material_usage_receipt_allocation
    WHERE source_movement_id = NEW.source_movement_id;
  SELECT COALESCE(SUM(quantity), 0) INTO consumed_total FROM public.production_material_usage_receipt_allocation
    WHERE consumption_movement_id = NEW.consumption_movement_id;
  IF source_total + NEW.quantity > source_quantity OR consumed_total + NEW.quantity > consumed_quantity THEN
    RAISE EXCEPTION 'Material source allocations exceed verified source or consumption quantity';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS production_material_usage_source_allocation_guard ON public.production_material_usage_receipt_allocation;
--> statement-breakpoint
CREATE TRIGGER production_material_usage_source_allocation_guard
  BEFORE INSERT ON public.production_material_usage_receipt_allocation
  FOR EACH ROW EXECUTE FUNCTION public.guard_production_material_usage_source_allocation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reject_production_material_usage_receipt_allocation_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Material source allocations are immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS production_material_usage_receipt_allocation_immutable ON public.production_material_usage_receipt_allocation;
--> statement-breakpoint
CREATE TRIGGER production_material_usage_receipt_allocation_immutable
  BEFORE UPDATE OR DELETE ON public.production_material_usage_receipt_allocation
  FOR EACH ROW EXECUTE FUNCTION public.reject_production_material_usage_receipt_allocation_mutation();
