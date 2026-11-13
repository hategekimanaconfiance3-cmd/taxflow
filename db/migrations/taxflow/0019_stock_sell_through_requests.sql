-- Add prospective sell-through policy and restock-request review records.
-- These requests do not create stock or tax postings; existing inbound paths
-- and prior transactions remain untouched. Drizzle's migrator applies this
-- file in one transaction; statement breakpoints keep PostgreSQL statements
-- separate for the postgres-js driver.

CREATE TABLE IF NOT EXISTS public.stock_sell_through_threshold (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL CONSTRAINT stock_sell_through_threshold_scope_check CHECK (scope_type IN ('default', 'category', 'product')),
  scope_key TEXT NOT NULL,
  threshold_percent REAL NOT NULL,
  effective_at TIMESTAMP NOT NULL,
  reason TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES public."user"(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT stock_sell_through_threshold_key_check CHECK (
    (scope_type = 'default' AND scope_key = '*') OR
    (scope_type IN ('category', 'product') AND scope_key <> '*')
  ),
  CONSTRAINT stock_sell_through_threshold_percent_check CHECK (threshold_percent >= 0 AND threshold_percent <= 100)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS stock_sell_through_threshold_scope_effective_idx
  ON public.stock_sell_through_threshold (scope_type, scope_key, effective_at);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.reject_stock_sell_through_threshold_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Stock sell-through threshold history is immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS stock_sell_through_threshold_immutable ON public.stock_sell_through_threshold;
--> statement-breakpoint
CREATE TRIGGER stock_sell_through_threshold_immutable
  BEFORE UPDATE OR DELETE ON public.stock_sell_through_threshold
  FOR EACH ROW EXECUTE FUNCTION public.reject_stock_sell_through_threshold_mutation();
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.stock_sell_through_cycle (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES public."user"(id),
  product_id TEXT NOT NULL REFERENCES public.product(id),
  baseline_quantity REAL NOT NULL,
  cycle_started_at TIMESTAMP NOT NULL,
  baseline_status TEXT NOT NULL,
  baseline_verified_by_user_id TEXT REFERENCES public."user"(id),
  baseline_verified_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT stock_sell_through_cycle_baseline_check CHECK (baseline_quantity >= 0),
  CONSTRAINT stock_sell_through_cycle_status_check CHECK (baseline_status IN ('needs_review', 'ledger_verified'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS stock_sell_through_cycle_business_product_uniq
  ON public.stock_sell_through_cycle (business_id, product_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS stock_sell_through_cycle_business_idx ON public.stock_sell_through_cycle (business_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.stock_restock_request (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES public."user"(id),
  product_id TEXT NOT NULL REFERENCES public.product(id),
  requested_quantity REAL NOT NULL,
  requested_by_user_id TEXT NOT NULL REFERENCES public."user"(id),
  idempotency_key TEXT NOT NULL,
  cycle_id TEXT NOT NULL REFERENCES public.stock_sell_through_cycle(id),
  cycle_started_at TIMESTAMP NOT NULL,
  threshold_id TEXT REFERENCES public.stock_sell_through_threshold(id),
  threshold_percent REAL,
  baseline_quantity REAL NOT NULL,
  cohort_quantity REAL NOT NULL,
  qualifying_sales_quantity REAL NOT NULL,
  required_sales_quantity REAL NOT NULL,
  sell_through_percent REAL,
  eligibility_status TEXT NOT NULL,
  eligibility_reason TEXT NOT NULL,
  source_evidence_refs TEXT NOT NULL,
  evaluated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  exception_reason TEXT,
  exception_status TEXT NOT NULL DEFAULT 'none',
  reviewed_by_user_id TEXT REFERENCES public."user"(id),
  reviewed_at TIMESTAMP,
  review_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT stock_restock_request_quantity_check CHECK (requested_quantity > 0 AND requested_quantity <= 1000000000),
  CONSTRAINT stock_restock_request_owner_check CHECK (requested_by_user_id = business_id),
  CONSTRAINT stock_restock_request_quantities_check CHECK (baseline_quantity >= 0 AND cohort_quantity >= 0 AND qualifying_sales_quantity >= 0 AND required_sales_quantity >= 0),
  CONSTRAINT stock_restock_request_eligibility_check CHECK (eligibility_status IN ('eligible', 'blocked', 'review_required')),
  CONSTRAINT stock_restock_request_exception_check CHECK (exception_status IN ('none', 'pending', 'approved', 'rejected')),
  CONSTRAINT stock_restock_request_threshold_check CHECK (threshold_percent IS NULL OR (threshold_percent >= 0 AND threshold_percent <= 100)),
  CONSTRAINT stock_restock_request_sell_through_check CHECK (sell_through_percent IS NULL OR (sell_through_percent >= 0 AND sell_through_percent <= 100)),
  CONSTRAINT stock_restock_request_exception_reason_check CHECK (exception_status = 'none' OR exception_reason IS NOT NULL),
  CONSTRAINT stock_restock_request_review_pair_check CHECK ((reviewed_by_user_id IS NULL) = (reviewed_at IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS stock_restock_request_business_idempotency_uniq
  ON public.stock_restock_request (business_id, idempotency_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS stock_restock_request_status_created_idx
  ON public.stock_restock_request (eligibility_status, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS stock_restock_request_exception_created_idx
  ON public.stock_restock_request (exception_status, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS stock_restock_request_business_product_created_idx
  ON public.stock_restock_request (business_id, product_id, created_at);
