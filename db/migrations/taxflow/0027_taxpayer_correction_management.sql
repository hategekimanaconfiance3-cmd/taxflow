CREATE TABLE IF NOT EXISTS public.taxpayer_correction_request (
  id text PRIMARY KEY,
  reference text NOT NULL UNIQUE,
  taxpayer_id text NOT NULL REFERENCES public."user"(id),
  submission_key text NOT NULL,
  category text NOT NULL CHECK (category IN ('personal_identity', 'business_profile')),
  field_key text NOT NULL CHECK (field_key IN ('name', 'businessName', 'email', 'phoneNumber', 'businessType')),
  original_value text NOT NULL,
  requested_value text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'awaiting_evidence', 'recommended_approval', 'recommended_rejection')),
  assigned_staff_id text REFERENCES public.rra_staff(id) ON DELETE SET NULL,
  recommendation text CHECK (recommendation IS NULL OR recommendation IN ('RECOMMEND_APPROVAL', 'RECOMMEND_REJECTION')),
  recommendation_reason text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS taxpayer_correction_owner_created_idx ON public.taxpayer_correction_request (taxpayer_id, created_at);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS taxpayer_correction_owner_submission_key_uniq ON public.taxpayer_correction_request (taxpayer_id, submission_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS taxpayer_correction_assigned_status_idx ON public.taxpayer_correction_request (assigned_staff_id, status, updated_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS taxpayer_correction_status_created_idx ON public.taxpayer_correction_request (status, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.taxpayer_correction_event (
  id text PRIMARY KEY,
  request_id text NOT NULL REFERENCES public.taxpayer_correction_request(id),
  actor_user_id text NOT NULL REFERENCES public."user"(id),
  event_type text NOT NULL,
  from_status text,
  to_status text,
  reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS taxpayer_correction_event_request_created_idx ON public.taxpayer_correction_event (request_id, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.taxpayer_correction_evidence (
  id text PRIMARY KEY,
  request_id text NOT NULL REFERENCES public.taxpayer_correction_request(id),
  uploader_user_id text NOT NULL REFERENCES public."user"(id),
  blob_pathname text NOT NULL UNIQUE,
  filename text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  content_type text NOT NULL DEFAULT 'application/pdf' CHECK (content_type = 'application/pdf'),
  created_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS taxpayer_correction_evidence_request_created_idx ON public.taxpayer_correction_evidence (request_id, created_at);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reject_taxpayer_correction_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Taxpayer correction history is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS taxpayer_correction_event_append_only ON public.taxpayer_correction_event;
--> statement-breakpoint
CREATE TRIGGER taxpayer_correction_event_append_only BEFORE UPDATE OR DELETE ON public.taxpayer_correction_event FOR EACH ROW EXECUTE FUNCTION public.reject_taxpayer_correction_history_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS taxpayer_correction_evidence_append_only ON public.taxpayer_correction_evidence;
--> statement-breakpoint
CREATE TRIGGER taxpayer_correction_evidence_append_only BEFORE UPDATE OR DELETE ON public.taxpayer_correction_evidence FOR EACH ROW EXECUTE FUNCTION public.reject_taxpayer_correction_history_mutation();
