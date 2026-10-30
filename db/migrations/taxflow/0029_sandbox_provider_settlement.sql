ALTER TABLE public.tax_payment
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_reference text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS tax_payment_provider_reference_uniq
  ON public.tax_payment (provider, provider_reference)
  WHERE provider IS NOT NULL AND provider_reference IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.tax_payment_receipt (
  id text PRIMARY KEY,
  payment_id text NOT NULL UNIQUE REFERENCES public.tax_payment(id),
  receipt_number text NOT NULL UNIQUE,
  taxpayer_id text NOT NULL REFERENCES public."user"(id),
  taxpayer_name text NOT NULL,
  obligation_id text NOT NULL REFERENCES public.tax_obligation(id),
  tax_type text NOT NULL,
  period_key text NOT NULL,
  assessment_reference text,
  amount integer NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  provider text NOT NULL,
  issued_at timestamp NOT NULL DEFAULT now(),
  provider_reference text NOT NULL,
  verification_status text NOT NULL DEFAULT 'VERIFIED' CHECK (verification_status = 'VERIFIED')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tax_payment_receipt_taxpayer_issued_idx
  ON public.tax_payment_receipt (taxpayer_id, issued_at);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reject_tax_payment_receipt_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Tax payment receipts are immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS tax_payment_receipt_append_only ON public.tax_payment_receipt;
--> statement-breakpoint
CREATE TRIGGER tax_payment_receipt_append_only
  BEFORE UPDATE OR DELETE ON public.tax_payment_receipt
  FOR EACH ROW EXECUTE FUNCTION public.reject_tax_payment_receipt_mutation();
