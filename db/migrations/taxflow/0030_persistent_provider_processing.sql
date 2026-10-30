ALTER TABLE public.tax_payment
  ADD COLUMN IF NOT EXISTS provider_request_reference text,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS simulation_scenario text,
  ADD COLUMN IF NOT EXISTS confirmed_amount integer,
  ADD COLUMN IF NOT EXISTS initiated_at timestamp,
  ADD COLUMN IF NOT EXISTS last_status_checked_at timestamp,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamp,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expires_at timestamp,
  ADD COLUMN IF NOT EXISTS last_provider_classification text,
  ADD COLUMN IF NOT EXISTS callback_processing_state text NOT NULL DEFAULT 'NONE';
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tax_payment_provider_status_check' AND conrelid='public.tax_payment'::regclass) THEN
    ALTER TABLE public.tax_payment ADD CONSTRAINT tax_payment_provider_status_check CHECK (provider_status IS NULL OR provider_status IN ('pending','success','failed','expired'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tax_payment_callback_state_check' AND conrelid='public.tax_payment'::regclass) THEN
    ALTER TABLE public.tax_payment ADD CONSTRAINT tax_payment_callback_state_check CHECK (callback_processing_state IN ('NONE','RECEIVED','AUTHENTICATED','REJECTED','PROCESSED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tax_payment_retry_count_check' AND conrelid='public.tax_payment'::regclass) THEN
    ALTER TABLE public.tax_payment ADD CONSTRAINT tax_payment_retry_count_check CHECK (retry_count >= 0);
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS tax_payment_provider_request_reference_uniq
  ON public.tax_payment (provider, provider_request_reference)
  WHERE provider IS NOT NULL AND provider_request_reference IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tax_payment_provider_poll_due_idx
  ON public.tax_payment (next_retry_at, created_at)
  WHERE status = 'pending' AND workflow_status IN ('PAYMENT_INITIATED','AWAITING_CONFIRMATION');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.tax_payment_provider_event (
  id text PRIMARY KEY,
  payment_id text NOT NULL REFERENCES public.tax_payment(id),
  event_key text NOT NULL UNIQUE,
  provider text NOT NULL CHECK (provider IN ('mtn_mobile_money','airtel_money','bank_gateway')),
  event_type text NOT NULL,
  classification text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tax_payment_provider_event_payment_created_idx
  ON public.tax_payment_provider_event (payment_id, created_at);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reject_tax_payment_provider_event_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Tax payment provider events are immutable'; END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS tax_payment_provider_event_append_only ON public.tax_payment_provider_event;
--> statement-breakpoint
CREATE TRIGGER tax_payment_provider_event_append_only
  BEFORE UPDATE OR DELETE ON public.tax_payment_provider_event
  FOR EACH ROW EXECUTE FUNCTION public.reject_tax_payment_provider_event_mutation();
