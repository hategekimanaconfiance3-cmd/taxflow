CREATE UNIQUE INDEX IF NOT EXISTS tax_obligation_taxpayer_id_id_uniq
  ON public.tax_obligation (taxpayer_id, id);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tax_payment_obligation_taxpayer_fkey'
      AND conrelid = 'public.tax_payment'::regclass
  ) THEN
    ALTER TABLE public.tax_payment
      ADD CONSTRAINT tax_payment_obligation_taxpayer_fkey
      FOREIGN KEY (business_id, obligation_id)
      REFERENCES public.tax_obligation (taxpayer_id, id);
  END IF;
END;
$$;
