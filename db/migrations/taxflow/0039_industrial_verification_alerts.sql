-- Source-aware production verification results and reviewable industrial alerts.
BEGIN;

CREATE TABLE IF NOT EXISTS public.industrial_verification_result (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES public.production_batch(id) ON DELETE CASCADE,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  machine_quantity NUMERIC(24,6),
  declared_quantity NUMERIC(24,6) NOT NULL,
  variance_quantity NUMERIC(24,6),
  tolerance_percent REAL NOT NULL,
  outcome TEXT NOT NULL,
  reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  comparison_key TEXT NOT NULL,
  checked_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT industrial_verification_comparison_key_uniq UNIQUE (comparison_key),
  CONSTRAINT industrial_verification_tolerance_check CHECK (tolerance_percent >= 0 AND tolerance_percent <= 100),
  CONSTRAINT industrial_verification_outcome_check CHECK (outcome IN ('matched', 'discrepant', 'no_machine_evidence', 'insufficient_evidence'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_verification_batch_checked_idx ON public.industrial_verification_result (batch_id, checked_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_verification_manufacturer_outcome_idx ON public.industrial_verification_result (manufacturer_id, outcome);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.industrial_alert (
  id TEXT PRIMARY KEY,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  factory_id TEXT NOT NULL REFERENCES public.factory(id),
  batch_id TEXT REFERENCES public.production_batch(id),
  gateway_id TEXT REFERENCES public.industrial_gateway(id),
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  summary TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key TEXT NOT NULL,
  resolved_by_user_id TEXT REFERENCES public."user"(id),
  resolved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT industrial_alert_dedupe_key_uniq UNIQUE (dedupe_key),
  CONSTRAINT industrial_alert_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT industrial_alert_status_check CHECK (status IN ('open', 'acknowledged', 'resolved'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_alert_factory_status_idx ON public.industrial_alert (factory_id, status, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_alert_manufacturer_status_idx ON public.industrial_alert (manufacturer_id, status);

COMMIT;
