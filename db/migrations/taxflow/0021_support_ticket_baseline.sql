-- Establish the legacy support-ticket table before the conversation upgrade in
-- 0022. Existing installations retain their rows and are not backfilled with
-- invented content; this statement only creates the table when it is absent.
CREATE TABLE IF NOT EXISTS public.support_ticket (
  id TEXT PRIMARY KEY,
  trader_id TEXT REFERENCES public."user"(id),
  category TEXT NOT NULL DEFAULT 'general',
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  assigned_to_id TEXT REFERENCES public."user"(id),
  resolution TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS support_ticket_trader_idx
  ON public.support_ticket (trader_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS support_ticket_status_idx
  ON public.support_ticket (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS support_ticket_assigned_idx
  ON public.support_ticket (assigned_to_id);
