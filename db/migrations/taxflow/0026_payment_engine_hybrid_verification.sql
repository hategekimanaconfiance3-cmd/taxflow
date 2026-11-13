ALTER TABLE public.tax_payment
  ALTER COLUMN status SET DEFAULT 'pending';
--> statement-breakpoint

ALTER TABLE public.tax_payment
  ADD COLUMN IF NOT EXISTS payment_reference text;
--> statement-breakpoint

UPDATE public.tax_payment
SET payment_reference = 'LEGACY-' || id
WHERE payment_reference IS NULL;
--> statement-breakpoint

ALTER TABLE public.tax_payment
  ALTER COLUMN payment_reference SET NOT NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS tax_payment_reference_uniq
  ON public.tax_payment (payment_reference);
--> statement-breakpoint

ALTER TABLE public.tax_payment
  ADD COLUMN IF NOT EXISTS workflow_status text NOT NULL DEFAULT 'AWAITING_CONFIRMATION';
--> statement-breakpoint

UPDATE public.tax_payment
SET workflow_status = CASE status
  WHEN 'confirmed' THEN 'PAID'
  WHEN 'rejected' THEN 'FAILED'
  ELSE 'AWAITING_CONFIRMATION'
END
WHERE workflow_status = 'AWAITING_CONFIRMATION';
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tax_payment_workflow_status_check'
      AND conrelid = 'public.tax_payment'::regclass
  ) THEN
    ALTER TABLE public.tax_payment
      ADD CONSTRAINT tax_payment_workflow_status_check
      CHECK (workflow_status IN (
        'DRAFT', 'ELIGIBILITY_CHECKED', 'READY_FOR_PAYMENT', 'PAYMENT_INITIATED',
        'AWAITING_CONFIRMATION', 'PROVIDER_CONFIRMED', 'RECONCILIATION_PENDING',
        'PAID', 'REVIEW_REQUIRED', 'FAILED', 'EXPIRED', 'CANCELLED',
        'REFUND_PENDING', 'REFUNDED'
      ));
  END IF;
END;
$$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.tax_payment_event (
  id text PRIMARY KEY,
  payment_id text NOT NULL REFERENCES public.tax_payment(id),
  event_key text NOT NULL UNIQUE,
  event_type text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  actor_user_id text REFERENCES public.user(id),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS tax_payment_event_payment_created_idx
  ON public.tax_payment_event (payment_id, created_at);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.reject_tax_payment_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Tax payment events are immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS tax_payment_event_append_only ON public.tax_payment_event;
--> statement-breakpoint

CREATE TRIGGER tax_payment_event_append_only
  BEFORE UPDATE OR DELETE ON public.tax_payment_event
  FOR EACH ROW EXECUTE FUNCTION public.reject_tax_payment_event_mutation();
