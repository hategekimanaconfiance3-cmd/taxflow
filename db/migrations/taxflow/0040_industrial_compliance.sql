-- Configurable integration requirements and reviewable compliance incidents.
BEGIN;

CREATE TABLE IF NOT EXISTS public.industrial_integration_policy (
  id TEXT PRIMARY KEY,
  factory_id TEXT NOT NULL REFERENCES public.factory(id) ON DELETE CASCADE,
  mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  required_equipment_count INTEGER NOT NULL DEFAULT 1,
  required_gateway_count INTEGER NOT NULL DEFAULT 1,
  integration_test_required BOOLEAN NOT NULL DEFAULT TRUE,
  exception_status TEXT NOT NULL DEFAULT 'none',
  exception_reason TEXT,
  current_status TEXT NOT NULL DEFAULT 'not_evaluated',
  last_evaluated_at TIMESTAMP,
  created_by_user_id TEXT NOT NULL REFERENCES public."user"(id),
  approved_by_user_id TEXT REFERENCES public."user"(id),
  approved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT industrial_integration_policy_factory_uniq UNIQUE (factory_id),
  CONSTRAINT industrial_integration_policy_equipment_count_check CHECK (required_equipment_count >= 0),
  CONSTRAINT industrial_integration_policy_gateway_count_check CHECK (required_gateway_count >= 0),
  CONSTRAINT industrial_integration_policy_exception_check CHECK (exception_status IN ('none', 'pending', 'approved', 'rejected')),
  CONSTRAINT industrial_integration_policy_status_check CHECK (current_status IN ('not_evaluated', 'compliant', 'non_compliant', 'exception', 'not_required')),
  CONSTRAINT industrial_integration_policy_exception_reason_check CHECK (exception_status = 'none' OR exception_reason IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_integration_policy_status_idx ON public.industrial_integration_policy (current_status, exception_status);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.industrial_compliance_incident (
  id TEXT PRIMARY KEY,
  factory_id TEXT NOT NULL REFERENCES public.factory(id) ON DELETE CASCADE,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  policy_id TEXT REFERENCES public.industrial_integration_policy(id),
  incident_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  summary TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_by_user_id TEXT REFERENCES public."user"(id),
  resolved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT industrial_compliance_incident_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT industrial_compliance_incident_status_check CHECK (status IN ('open', 'acknowledged', 'resolved'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_compliance_incident_factory_status_idx ON public.industrial_compliance_incident (factory_id, status, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_compliance_incident_manufacturer_idx ON public.industrial_compliance_incident (manufacturer_id, status);

COMMIT;
