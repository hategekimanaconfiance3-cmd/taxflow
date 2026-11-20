-- Gateways may know a manufacturer batch reference instead of TaxFlow's UUID.
BEGIN;
ALTER TABLE public.industrial_event ADD COLUMN IF NOT EXISTS batch_reference TEXT;
COMMIT;
