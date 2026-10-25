-- Store durable replies in the existing support ticket workflow.
-- Safe to rerun; db:push also manages this schema in CI.
BEGIN;

CREATE TABLE IF NOT EXISTS public.support_ticket_message (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES public.support_ticket(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES public."user"(id),
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_ticket_message_ticket_created_idx
  ON public.support_ticket_message (ticket_id, created_at);

COMMIT;
