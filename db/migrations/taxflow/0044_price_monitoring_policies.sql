-- Configurable significant-price thresholds and severity bands.
-- Existing price history and alerts remain append-only evidence.
BEGIN;

CREATE TABLE IF NOT EXISTS public.price_monitoring_policy (
  id TEXT PRIMARY KEY NOT NULL,
  scope_type TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  increase_threshold_percent REAL NOT NULL DEFAULT 5,
  decrease_threshold_percent REAL NOT NULL DEFAULT 5,
  absolute_difference_rwf INTEGER NOT NULL DEFAULT 0,
  medium_threshold_percent REAL NOT NULL DEFAULT 10,
  high_threshold_percent REAL NOT NULL DEFAULT 20,
  critical_threshold_percent REAL NOT NULL DEFAULT 50,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id TEXT NOT NULL REFERENCES public."user"(id),
  updated_by_user_id TEXT NOT NULL REFERENCES public."user"(id),
  created_at TIMESTAMP DEFAULT now() NOT NULL,
  updated_at TIMESTAMP DEFAULT now() NOT NULL,
  CONSTRAINT price_monitoring_policy_scope_check CHECK (scope_type IN ('default', 'category', 'product')),
  CONSTRAINT price_monitoring_policy_scope_key_check CHECK ((scope_type = 'default' AND scope_key = '*') OR (scope_type IN ('category', 'product') AND length(trim(scope_key)) > 0)),
  CONSTRAINT price_monitoring_policy_threshold_check CHECK (increase_threshold_percent >= 0 AND decrease_threshold_percent >= 0 AND absolute_difference_rwf >= 0 AND medium_threshold_percent >= increase_threshold_percent AND high_threshold_percent >= medium_threshold_percent AND critical_threshold_percent >= high_threshold_percent)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS price_monitoring_policy_scope_uniq ON public.price_monitoring_policy (scope_type, scope_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS price_monitoring_policy_active_idx ON public.price_monitoring_policy (is_active, scope_type);
--> statement-breakpoint

ALTER TABLE public.price_change_alert ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'low';
--> statement-breakpoint
ALTER TABLE public.price_change_alert ADD COLUMN IF NOT EXISTS alert_reason TEXT;
--> statement-breakpoint
ALTER TABLE public.price_change_alert DROP CONSTRAINT IF EXISTS price_change_alert_status_check;
--> statement-breakpoint
ALTER TABLE public.price_change_alert ADD CONSTRAINT price_change_alert_status_check CHECK (status IN ('pending', 'reviewed', 'escalated', 'suspicious', 'resolved'));
--> statement-breakpoint
ALTER TABLE public.price_change_alert DROP CONSTRAINT IF EXISTS price_change_alert_severity_check;
--> statement-breakpoint
ALTER TABLE public.price_change_alert ADD CONSTRAINT price_change_alert_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS price_change_alert_severity_created_idx ON public.price_change_alert (severity, created_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.price_change_alert_explanation (
  id TEXT PRIMARY KEY NOT NULL,
  alert_id TEXT NOT NULL REFERENCES public.price_change_alert(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES public."user"(id),
  submitted_by_user_id TEXT NOT NULL REFERENCES public."user"(id),
  explanation TEXT NOT NULL,
  supporting_document_url TEXT,
  created_at TIMESTAMP DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS price_change_alert_explanation_alert_idx ON public.price_change_alert_explanation (alert_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS price_change_alert_explanation_business_idx ON public.price_change_alert_explanation (business_id, created_at);

COMMIT;
