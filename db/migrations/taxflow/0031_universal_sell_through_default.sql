-- TaxFlow's proposed global sell-through default (not a statutory tax rule).
-- The bootstrap threshold has no human actor; subsequent revisions are always
-- tied to an authenticated RRA administrator and are immutable history rows.
ALTER TABLE public.stock_sell_through_threshold
  ALTER COLUMN created_by_user_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public.stock_sell_through_threshold
  ADD COLUMN IF NOT EXISTS created_by_role TEXT;
--> statement-breakpoint
ALTER TABLE public.stock_restock_request
  DROP CONSTRAINT IF EXISTS stock_restock_request_exception_check;
--> statement-breakpoint
ALTER TABLE public.stock_restock_request
  ADD CONSTRAINT stock_restock_request_exception_check
  CHECK (exception_status IN ('none', 'pending', 'approved', 'rejected', 'consumed'));
--> statement-breakpoint
INSERT INTO public.stock_sell_through_threshold (
  id, scope_type, scope_key, threshold_percent, effective_at, reason, created_by_user_id, created_by_role
)
VALUES (
  'taxflow-global-sell-through-default-75', 'default', '*', 75,
  NOW(), 'Initial TaxFlow global sell-through policy default: 75%.', NULL, NULL
)
ON CONFLICT (id) DO NOTHING;
