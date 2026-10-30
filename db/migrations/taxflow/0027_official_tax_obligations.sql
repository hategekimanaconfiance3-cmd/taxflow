CREATE TABLE IF NOT EXISTS public.tax_obligation (
  id text PRIMARY KEY,
  taxpayer_id text NOT NULL REFERENCES public."user"(id),
  tax_type text NOT NULL CHECK (length(trim(tax_type)) BETWEEN 1 AND 80),
  period_key text NOT NULL CHECK (length(trim(period_key)) BETWEEN 1 AND 32),
  assessment_reference text UNIQUE,
  assessment_source text NOT NULL CHECK (assessment_source IN ('OFFICIAL_RRA','TAXFLOW_CALCULATED')),
  tax_rule_version text,
  calculation_explanation jsonb,
  assessment_date timestamp NOT NULL,
  due_date timestamp,
  original_amount numeric(20,2) NOT NULL CHECK (original_amount > 0),
  currency text NOT NULL DEFAULT 'RWF' CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'FINALIZED'
    CHECK (status IN ('DRAFT','ESTIMATED','FINALIZED','DISPUTED','CANCELLED','PAYABLE','PAID','CLOSED_ZERO_BALANCE')),
  supporting_evidence_reference text NOT NULL CHECK (length(trim(supporting_evidence_reference)) BETWEEN 1 AND 500),
  source_payload_hash text,
  created_by text NOT NULL REFERENCES public."user"(id),
  finalized_by text NOT NULL REFERENCES public."user"(id),
  finalized_at timestamp NOT NULL DEFAULT now(),
  approved_by text REFERENCES public."user"(id),
  approved_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT tax_obligation_approval_pair_check CHECK ((approved_by IS NULL) = (approved_at IS NULL)),
  CONSTRAINT tax_obligation_payable_requires_approval_check CHECK (status NOT IN ('PAYABLE','PAID') OR approved_by IS NOT NULL),
  CONSTRAINT tax_obligation_rwf_integral_amount_check CHECK (currency <> 'RWF' OR original_amount = trunc(original_amount)),
  CONSTRAINT tax_obligation_source_reference_check CHECK (
    (assessment_source = 'OFFICIAL_RRA' AND assessment_reference IS NOT NULL AND length(trim(assessment_reference)) > 0)
    OR
    (assessment_source = 'TAXFLOW_CALCULATED' AND tax_rule_version IS NOT NULL AND status IN ('DRAFT','ESTIMATED'))
  )
);
--> statement-breakpoint

ALTER TABLE public.tax_payment
  ADD COLUMN IF NOT EXISTS obligation_id text;
--> statement-breakpoint
ALTER TABLE public.tax_payment
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'RWF';
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tax_payment_currency_check'
      AND conrelid = 'public.tax_payment'::regclass
  ) THEN
    ALTER TABLE public.tax_payment
      ADD CONSTRAINT tax_payment_currency_check CHECK (currency ~ '^[A-Z]{3}$');
  END IF;
END;
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tax_payment_obligation_id_fkey'
      AND conrelid = 'public.tax_payment'::regclass
  ) THEN
    ALTER TABLE public.tax_payment
      ADD CONSTRAINT tax_payment_obligation_id_fkey
      FOREIGN KEY (obligation_id) REFERENCES public.tax_obligation(id);
  END IF;
END;
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tax_payment_obligation_id_idx
  ON public.tax_payment (obligation_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS tax_obligation_taxpayer_period_idx
  ON public.tax_obligation (taxpayer_id, tax_type, period_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tax_obligation_status_due_idx
  ON public.tax_obligation (status, due_date);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.tax_obligation_adjustment (
  id text PRIMARY KEY,
  obligation_id text NOT NULL REFERENCES public.tax_obligation(id),
  kind text NOT NULL CHECK (kind IN ('INCREASE','DECREASE','CREDIT','EXEMPTION')),
  amount numeric(20,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 1000),
  evidence_reference text NOT NULL CHECK (length(trim(evidence_reference)) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED','APPROVED','REJECTED')),
  created_by text NOT NULL REFERENCES public."user"(id),
  approved_by text REFERENCES public."user"(id),
  approved_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT tax_obligation_adjustment_approval_pair_check CHECK ((approved_by IS NULL) = (approved_at IS NULL))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tax_obligation_adjustment_obligation_status_idx
  ON public.tax_obligation_adjustment (obligation_id, status);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.tax_obligation_event (
  id text PRIMARY KEY,
  obligation_id text NOT NULL REFERENCES public.tax_obligation(id),
  event_key text NOT NULL UNIQUE,
  event_type text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  actor_user_id text REFERENCES public."user"(id),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tax_obligation_event_created_idx
  ON public.tax_obligation_event (obligation_id, created_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.tax_period_payment_score_snapshot (
  id text PRIMARY KEY,
  taxpayer_id text NOT NULL REFERENCES public."user"(id),
  tax_type text NOT NULL,
  period_key text NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  state text NOT NULL CHECK (state IN ('AVAILABLE','NO_OBLIGATION','INSUFFICIENT_DATA')),
  net_obligation numeric(20,2),
  confirmed_payments numeric(20,2),
  outstanding_amount numeric(20,2),
  score numeric(20,4),
  calculated_at timestamp NOT NULL DEFAULT now(),
  explanation jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT tax_period_payment_score_values_check CHECK (
    (state = 'AVAILABLE' AND net_obligation > 0 AND confirmed_payments >= 0 AND outstanding_amount >= 0 AND score IS NOT NULL)
    OR (state <> 'AVAILABLE' AND score IS NULL)
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tax_period_payment_score_owner_idx
  ON public.tax_period_payment_score_snapshot (taxpayer_id, period_key, tax_type, currency, calculated_at);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.reject_tax_obligation_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Tax obligation events are immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS tax_obligation_event_append_only ON public.tax_obligation_event;
--> statement-breakpoint
CREATE TRIGGER tax_obligation_event_append_only
  BEFORE UPDATE OR DELETE ON public.tax_obligation_event
  FOR EACH ROW EXECUTE FUNCTION public.reject_tax_obligation_event_mutation();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.reject_tax_period_score_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Tax period payment score snapshots are immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS tax_period_payment_score_append_only ON public.tax_period_payment_score_snapshot;
--> statement-breakpoint
CREATE TRIGGER tax_period_payment_score_append_only
  BEFORE UPDATE OR DELETE ON public.tax_period_payment_score_snapshot
  FOR EACH ROW EXECUTE FUNCTION public.reject_tax_period_score_mutation();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.protect_tax_obligation_original_assessment() RETURNS trigger AS $$
BEGIN
  IF ROW(NEW.taxpayer_id, NEW.tax_type, NEW.period_key, NEW.assessment_reference, NEW.assessment_source,
         NEW.tax_rule_version, NEW.assessment_date, NEW.due_date, NEW.original_amount, NEW.currency,
         NEW.supporting_evidence_reference, NEW.source_payload_hash)
     IS DISTINCT FROM
     ROW(OLD.taxpayer_id, OLD.tax_type, OLD.period_key, OLD.assessment_reference, OLD.assessment_source,
         OLD.tax_rule_version, OLD.assessment_date, OLD.due_date, OLD.original_amount, OLD.currency,
         OLD.supporting_evidence_reference, OLD.source_payload_hash) THEN
    RAISE EXCEPTION 'Original tax assessment data is immutable; record an adjustment instead';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS tax_obligation_original_assessment_immutable ON public.tax_obligation;
--> statement-breakpoint
CREATE TRIGGER tax_obligation_original_assessment_immutable
  BEFORE UPDATE ON public.tax_obligation
  FOR EACH ROW EXECUTE FUNCTION public.protect_tax_obligation_original_assessment();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.protect_approved_tax_obligation_adjustment() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'APPROVED' THEN
    RAISE EXCEPTION 'Approved tax obligation adjustments are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS tax_obligation_adjustment_immutable ON public.tax_obligation_adjustment;
--> statement-breakpoint
CREATE TRIGGER tax_obligation_adjustment_immutable
  BEFORE UPDATE OR DELETE ON public.tax_obligation_adjustment
  FOR EACH ROW EXECUTE FUNCTION public.protect_approved_tax_obligation_adjustment();
