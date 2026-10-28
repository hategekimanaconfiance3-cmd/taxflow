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
  author_id TEXT REFERENCES public."user"(id),
  sender_user_id TEXT NOT NULL REFERENCES public."user"(id),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('taxpayer', 'staff')),
  -- Legacy descriptions are preserved verbatim during backfill. New messages
  -- are constrained by the shared server-side Zod schema.
  body TEXT NOT NULL,
  client_message_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

-- Production may already contain the earlier support-message table, which
-- used author_id rather than sender_user_id. Preserve it and add the fields
-- required by the conversation model before creating indexes or backfilling.
ALTER TABLE public.support_ticket_message
  ADD COLUMN IF NOT EXISTS author_id TEXT REFERENCES public."user"(id),
  ADD COLUMN IF NOT EXISTS sender_user_id TEXT,
  ADD COLUMN IF NOT EXISTS sender_type TEXT,
  ADD COLUMN IF NOT EXISTS client_message_id TEXT;
--> statement-breakpoint

DO $$
DECLARE has_author_id BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'support_ticket_message'
      AND column_name = 'author_id'
  ) INTO has_author_id;

  IF EXISTS (SELECT 1 FROM public.support_ticket_message WHERE sender_user_id IS NULL) THEN
    IF NOT has_author_id THEN
      RAISE EXCEPTION 'Cannot migrate support_ticket_message: existing rows have no sender_user_id or author_id.';
    END IF;
    EXECUTE 'UPDATE public.support_ticket_message SET sender_user_id = author_id WHERE sender_user_id IS NULL';
  END IF;

  IF EXISTS (SELECT 1 FROM public.support_ticket_message WHERE sender_type IS NULL) THEN
    UPDATE public.support_ticket_message AS message
    SET sender_type = CASE
      WHEN ticket.trader_id = message.sender_user_id THEN 'taxpayer'
      ELSE 'staff'
    END
    FROM public.support_ticket AS ticket
    WHERE ticket.id = message.ticket_id
      AND message.sender_type IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.support_ticket_message
    WHERE sender_user_id IS NULL OR sender_type IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot migrate support_ticket_message: one or more existing messages could not be attributed to a sender.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.support_ticket_message
    WHERE sender_type NOT IN ('taxpayer', 'staff')
  ) THEN
    RAISE EXCEPTION 'Cannot migrate support_ticket_message: an existing sender_type is unsupported.';
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE public.support_ticket_message
  ALTER COLUMN sender_user_id SET NOT NULL,
  ALTER COLUMN sender_type SET NOT NULL;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.support_ticket_message'::regclass
      AND conname = 'support_ticket_message_author_id_fkey'
  ) THEN
    ALTER TABLE public.support_ticket_message
      ADD CONSTRAINT support_ticket_message_author_id_fkey
      FOREIGN KEY (author_id) REFERENCES public."user"(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.support_ticket_message'::regclass
      AND conname = 'support_ticket_message_sender_user_id_fkey'
  ) THEN
    ALTER TABLE public.support_ticket_message
      ADD CONSTRAINT support_ticket_message_sender_user_id_fkey
      FOREIGN KEY (sender_user_id) REFERENCES public."user"(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.support_ticket_message'::regclass
      AND conname = 'support_ticket_message_sender_type_check'
  ) THEN
    ALTER TABLE public.support_ticket_message
      ADD CONSTRAINT support_ticket_message_sender_type_check
      CHECK (sender_type IN ('taxpayer', 'staff'));
  END IF;
END $$;
--> statement-breakpoint

-- Keep the deployed legacy app writing through author_id while the new app
-- writes sender_user_id. The trigger synchronizes both forms during rollout.
CREATE OR REPLACE FUNCTION public.sync_support_ticket_message_sender()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE ticket_owner_id TEXT;
BEGIN
  IF NEW.sender_user_id IS NULL THEN
    NEW.sender_user_id := NEW.author_id;
  END IF;
  IF NEW.author_id IS NULL THEN
    NEW.author_id := NEW.sender_user_id;
  END IF;
  IF NEW.sender_type IS NULL THEN
    SELECT trader_id INTO ticket_owner_id
    FROM public.support_ticket
    WHERE id = NEW.ticket_id;
    NEW.sender_type := CASE
      WHEN ticket_owner_id IS NOT NULL AND NEW.sender_user_id = ticket_owner_id THEN 'taxpayer'
      ELSE 'staff'
    END;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS support_ticket_message_sender_compatibility ON public.support_ticket_message;
--> statement-breakpoint
CREATE TRIGGER support_ticket_message_sender_compatibility
BEFORE INSERT ON public.support_ticket_message
FOR EACH ROW
EXECUTE FUNCTION public.sync_support_ticket_message_sender();
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
INSERT INTO public.support_ticket_message (id, ticket_id, author_id, sender_user_id, sender_type, body, created_at)
SELECT gen_random_uuid()::text, t.id, t.trader_id, t.trader_id, 'taxpayer', t.description, t.created_at
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
