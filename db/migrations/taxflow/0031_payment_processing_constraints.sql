DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tax_payment_simulation_scenario_check' AND conrelid='public.tax_payment'::regclass) THEN
    ALTER TABLE public.tax_payment ADD CONSTRAINT tax_payment_simulation_scenario_check
      CHECK (simulation_scenario IS NULL OR simulation_scenario IN ('success','pending','rejected','insufficient_funds','invalid_payer','timeout','unavailable','delayed','expired'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tax_payment_confirmed_amount_check' AND conrelid='public.tax_payment'::regclass) THEN
    ALTER TABLE public.tax_payment ADD CONSTRAINT tax_payment_confirmed_amount_check CHECK (confirmed_amount IS NULL OR confirmed_amount > 0);
  END IF;
END $$;
