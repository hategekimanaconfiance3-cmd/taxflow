-- Extend existing support requests into secure conversations and add private
-- RRA staff conversations. Existing request descriptions are preserved as the
-- original message; no message content is exposed through notifications.
ALTER TABLE public.support_ticket
  ALTER COLUMN trader_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS thread_type TEXT NOT NULL DEFAULT 'taxpayer',
  ADD COLUMN IF NOT EXISTS routing_category TEXT,
  ADD COLUMN IF NOT EXISTS routing_department TEXT,
  ADD COLUMN IF NOT EXISTS routing_reason TEXT;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'support_ticket_thread_type_check') THEN
    ALTER TABLE public.support_ticket
      ADD CONSTRAINT support_ticket_thread_type_check CHECK (thread_type IN ('taxpayer', 'staff'));
  END IF;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.support_ticket_message (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES public.support_ticket(id) ON DELETE CASCADE,
  sender_user_id TEXT NOT NULL REFERENCES public."user"(id),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('taxpayer', 'staff')),
  -- Legacy descriptions are preserved verbatim during backfill. New messages
  -- are constrained by the shared server-side Zod schema.
  body TEXT NOT NULL,
  client_message_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS support_ticket_message_chronology_idx
  ON public.support_ticket_message (ticket_id, created_at, id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS support_ticket_message_sender_idx
  ON public.support_ticket_message (sender_user_id, created_at);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS support_ticket_message_idempotency_uniq
  ON public.support_ticket_message (sender_user_id, client_message_id)
  WHERE client_message_id IS NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.support_ticket_participant (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES public.support_ticket(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  participant_type TEXT NOT NULL CHECK (participant_type IN ('taxpayer', 'staff', 'queue')),
  last_read_at TIMESTAMP,
  archived_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT support_ticket_participant_ticket_user_uniq UNIQUE (ticket_id, user_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS support_ticket_participant_user_read_idx
  ON public.support_ticket_participant (user_id, last_read_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS support_ticket_category_status_idx
  ON public.support_ticket (category, status, updated_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS support_ticket_routing_status_idx
  ON public.support_ticket (routing_category, routing_department, status, updated_at);
--> statement-breakpoint

-- Preserve each legacy ticket's opening text as its first immutable message.
INSERT INTO public.support_ticket_message (id, ticket_id, sender_user_id, sender_type, body, created_at)
SELECT gen_random_uuid()::text, t.id, t.trader_id, 'taxpayer', t.description, t.created_at
FROM public.support_ticket t
WHERE t.trader_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.support_ticket_message m
    WHERE m.ticket_id = t.id AND m.sender_user_id = t.trader_id
      AND m.created_at = t.created_at AND m.body = t.description
  );
--> statement-breakpoint

INSERT INTO public.support_ticket_participant (id, ticket_id, user_id, participant_type, created_at)
SELECT gen_random_uuid()::text, t.id, t.trader_id, 'taxpayer', t.created_at
FROM public.support_ticket t
WHERE t.trader_id IS NOT NULL
ON CONFLICT (ticket_id, user_id) DO NOTHING;
--> statement-breakpoint

UPDATE public.support_ticket
SET category = CASE category
  WHEN 'tax_query' THEN 'tax_declaration'
  WHEN 'account_issue' THEN 'account_access'
  WHEN 'system_bug' THEN 'general'
  WHEN 'other' THEN 'general'
  ELSE category
END
WHERE category IN ('tax_query', 'account_issue', 'system_bug', 'other');
--> statement-breakpoint

UPDATE public.support_ticket
SET routing_category = category
WHERE routing_category IS NULL;
