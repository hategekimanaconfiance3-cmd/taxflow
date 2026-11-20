-- Factory registration and production-line architecture.
-- Historical production batches remain valid; factory and line links are nullable
-- until an existing batch is explicitly associated with a registered facility.
BEGIN;

CREATE TABLE IF NOT EXISTS public.factory (
  id TEXT PRIMARY KEY,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  factory_code TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  industry_type TEXT NOT NULL DEFAULT 'beverage',
  registration_reference TEXT,
  production_capacity NUMERIC(24,6),
  production_capacity_unit TEXT,
  onboarding_status TEXT NOT NULL DEFAULT 'draft',
  integration_status TEXT NOT NULL DEFAULT 'not_started',
  connectivity_status TEXT NOT NULL DEFAULT 'unknown',
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  submitted_at TIMESTAMP,
  reviewed_by_user_id TEXT REFERENCES public."user"(id),
  reviewed_at TIMESTAMP,
  review_note TEXT,
  approved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT factory_manufacturer_code_uniq UNIQUE (manufacturer_id, factory_code),
  CONSTRAINT factory_coordinates_pair_check CHECK (
    (latitude IS NULL AND longitude IS NULL) OR
    (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  ),
  CONSTRAINT factory_capacity_pair_check CHECK (
    (production_capacity IS NULL AND production_capacity_unit IS NULL) OR
    (production_capacity > 0 AND production_capacity_unit IS NOT NULL AND length(trim(production_capacity_unit)) > 0)
  ),
  CONSTRAINT factory_onboarding_status_check CHECK (onboarding_status IN (
    'draft', 'submitted', 'under_review', 'technical_assessment',
    'integration_pending', 'integration_testing', 'approved', 'active',
    'suspended', 'rejected'
  )),
  CONSTRAINT factory_integration_status_check CHECK (integration_status IN (
    'not_started', 'pending', 'testing', 'connected', 'non_compliant', 'exception'
  )),
  CONSTRAINT factory_connectivity_status_check CHECK (connectivity_status IN ('unknown', 'online', 'degraded', 'offline')),
  CONSTRAINT factory_verification_status_check CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS factory_manufacturer_status_idx ON public.factory (manufacturer_id, onboarding_status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS factory_integration_status_idx ON public.factory (integration_status, connectivity_status);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.factory_production_line (
  id TEXT PRIMARY KEY,
  factory_id TEXT NOT NULL REFERENCES public.factory(id),
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  line_code TEXT NOT NULL,
  name TEXT NOT NULL,
  production_category TEXT NOT NULL DEFAULT 'beverage',
  product_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  production_capacity NUMERIC(24,6),
  production_capacity_unit TEXT,
  operational_status TEXT NOT NULL DEFAULT 'planned',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT factory_line_factory_code_uniq UNIQUE (factory_id, line_code),
  CONSTRAINT factory_line_capacity_pair_check CHECK (
    (production_capacity IS NULL AND production_capacity_unit IS NULL) OR
    (production_capacity > 0 AND production_capacity_unit IS NOT NULL AND length(trim(production_capacity_unit)) > 0)
  ),
  CONSTRAINT factory_line_operational_status_check CHECK (operational_status IN ('planned', 'active', 'maintenance', 'suspended', 'decommissioned'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS factory_line_manufacturer_idx ON public.factory_production_line (manufacturer_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS factory_line_factory_status_idx ON public.factory_production_line (factory_id, operational_status);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.factory_production_stage (
  id TEXT PRIMARY KEY,
  line_id TEXT NOT NULL REFERENCES public.factory_production_line(id),
  stage_code TEXT NOT NULL,
  name TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT factory_stage_line_code_uniq UNIQUE (line_id, stage_code),
  CONSTRAINT factory_stage_line_sequence_uniq UNIQUE (line_id, sequence_number),
  CONSTRAINT factory_stage_sequence_positive_check CHECK (sequence_number > 0),
  CONSTRAINT factory_stage_status_check CHECK (status IN ('active', 'inactive'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS factory_stage_line_status_idx ON public.factory_production_stage (line_id, status);
--> statement-breakpoint

ALTER TABLE public.production_batch
  ADD COLUMN IF NOT EXISTS factory_id TEXT REFERENCES public.factory(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS production_line_id TEXT REFERENCES public.factory_production_line(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS prod_batch_factory_created_idx ON public.production_batch (factory_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS prod_batch_line_created_idx ON public.production_batch (production_line_id, created_at);

COMMIT;
