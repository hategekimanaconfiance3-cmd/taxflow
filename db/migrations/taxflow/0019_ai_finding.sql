BEGIN;

-- Persistent findings are referenced by reconciliation, analytics and the RRA command center.
-- Keep creation idempotent so deployments can safely apply it after a prior schema push.
CREATE TABLE IF NOT EXISTS public.ai_finding (
  id TEXT PRIMARY KEY,
  finding_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  business_id TEXT REFERENCES public."user"(id),
  product_id TEXT REFERENCES public.product(id),
  transaction_ids TEXT,
  observed_value REAL,
  expected_value REAL,
  difference REAL,
  difference_unit TEXT,
  explanation TEXT NOT NULL,
  evidence_refs TEXT,
  detection_method TEXT NOT NULL,
  review_status TEXT DEFAULT 'open',
  assigned_reviewer_id TEXT REFERENCES public."user"(id),
  resolution_notes TEXT,
  resolved_at TIMESTAMP,
  model_version TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_finding_business_idx ON public.ai_finding (business_id);
CREATE INDEX IF NOT EXISTS ai_finding_type_idx ON public.ai_finding (finding_type);
CREATE INDEX IF NOT EXISTS ai_finding_severity_idx ON public.ai_finding (severity);
CREATE INDEX IF NOT EXISTS ai_finding_review_status_idx ON public.ai_finding (review_status);
CREATE INDEX IF NOT EXISTS ai_finding_created_idx ON public.ai_finding (created_at);
COMMIT;
