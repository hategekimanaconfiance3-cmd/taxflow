CREATE TABLE IF NOT EXISTS public.rra_staff_jurisdiction (
  id TEXT PRIMARY KEY NOT NULL,
  staff_record_id TEXT NOT NULL REFERENCES public.rra_staff(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL,
  province TEXT,
  district TEXT,
  assigned_by_user_id TEXT NOT NULL REFERENCES public."user"(id),
  created_at TIMESTAMP DEFAULT now() NOT NULL,
  CONSTRAINT rra_staff_jurisdiction_scope_check CHECK (scope_type IN ('national', 'province', 'district')),
  CONSTRAINT rra_staff_jurisdiction_values_check CHECK (
    (scope_type = 'national' AND province IS NULL AND district IS NULL)
    OR (scope_type = 'province' AND province IS NOT NULL AND district IS NULL)
    OR (scope_type = 'district' AND province IS NOT NULL AND district IS NOT NULL)
  )
);
--> statement-breakpoint
DROP INDEX IF EXISTS public.rra_staff_jurisdiction_scope_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS rra_staff_jurisdiction_scope_uniq ON public.rra_staff_jurisdiction (staff_record_id, scope_type, coalesce(province, ''), coalesce(district, ''));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS rra_staff_jurisdiction_lookup_idx ON public.rra_staff_jurisdiction (scope_type, province, district);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.merchant_price_history (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL REFERENCES public."user"(id),
  product_id TEXT NOT NULL REFERENCES public.product(id),
  previous_price INTEGER,
  new_price INTEGER NOT NULL,
  difference_rwf INTEGER DEFAULT 0 NOT NULL,
  percentage_change REAL DEFAULT 0 NOT NULL,
  currency TEXT DEFAULT 'RWF' NOT NULL,
  unit TEXT NOT NULL,
  pricing_context TEXT DEFAULT 'selling' NOT NULL,
  change_kind TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES public."user"(id),
  reason TEXT,
  changed_at TIMESTAMP DEFAULT now() NOT NULL,
  created_at TIMESTAMP DEFAULT now() NOT NULL,
  CONSTRAINT merchant_price_history_previous_price_check CHECK (previous_price IS NULL OR previous_price > 0),
  CONSTRAINT merchant_price_history_new_price_check CHECK (new_price > 0),
  CONSTRAINT merchant_price_history_change_kind_check CHECK (change_kind IN ('initial', 'merchant_update', 'authorized_correction', 'system_sync'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS merchant_price_history_source_uniq ON public.merchant_price_history (source_type, source_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS merchant_price_history_business_product_changed_idx ON public.merchant_price_history (business_id, product_id, changed_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS merchant_price_history_changed_idx ON public.merchant_price_history (changed_at);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.reject_merchant_price_history_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Merchant price history is append-only; submit a new price event instead';
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS merchant_price_history_immutable ON public.merchant_price_history;
CREATE TRIGGER merchant_price_history_immutable
BEFORE UPDATE OR DELETE ON public.merchant_price_history
FOR EACH ROW EXECUTE FUNCTION public.reject_merchant_price_history_mutation();
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.price_change_alert (
  id TEXT PRIMARY KEY NOT NULL,
  price_history_id TEXT NOT NULL UNIQUE REFERENCES public.merchant_price_history(id),
  business_id TEXT NOT NULL REFERENCES public."user"(id),
  product_id TEXT NOT NULL REFERENCES public.product(id),
  merchant_province TEXT,
  merchant_district TEXT,
  direction TEXT NOT NULL,
  previous_price INTEGER NOT NULL,
  new_price INTEGER NOT NULL,
  difference_rwf INTEGER NOT NULL,
  percentage_change REAL NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL,
  assignment_status TEXT DEFAULT 'unassigned' NOT NULL,
  assigned_staff_id TEXT REFERENCES public.rra_staff(id) ON DELETE SET NULL,
  review_note TEXT,
  reviewed_by_user_id TEXT REFERENCES public."user"(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  escalated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now() NOT NULL,
  updated_at TIMESTAMP DEFAULT now() NOT NULL,
  CONSTRAINT price_change_alert_direction_check CHECK (direction IN ('increase', 'decrease')),
  CONSTRAINT price_change_alert_status_check CHECK (status IN ('pending', 'reviewed', 'escalated')),
  CONSTRAINT price_change_alert_assignment_check CHECK (assignment_status IN ('assigned', 'unassigned'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS price_change_alert_status_created_idx ON public.price_change_alert (status, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS price_change_alert_assignment_idx ON public.price_change_alert (assignment_status, assigned_staff_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS price_change_alert_business_created_idx ON public.price_change_alert (business_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS price_change_alert_product_created_idx ON public.price_change_alert (product_id, created_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.price_change_alert_recipient (
  id TEXT PRIMARY KEY NOT NULL,
  alert_id TEXT NOT NULL REFERENCES public.price_change_alert(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES public."user"(id),
  scope_type TEXT NOT NULL,
  notification_id TEXT NOT NULL REFERENCES public.notification(id),
  notified_at TIMESTAMP DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS price_change_alert_recipient_uniq ON public.price_change_alert_recipient (alert_id, recipient_user_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS price_change_alert_notification_uniq ON public.price_change_alert_recipient (notification_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS price_change_alert_recipient_user_idx ON public.price_change_alert_recipient (recipient_user_id, notified_at);
