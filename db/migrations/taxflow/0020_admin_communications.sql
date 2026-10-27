BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_conversation (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('direct', 'broadcast')),
  subject TEXT NOT NULL CHECK (length(subject) BETWEEN 1 AND 160),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  created_by TEXT NOT NULL REFERENCES public."user"(id) ON DELETE RESTRICT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_conversation_created_idx
  ON public.admin_conversation (created_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_conversation_participant (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES public.admin_conversation(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE RESTRICT,
  participant_type TEXT NOT NULL CHECK (participant_type IN ('sender', 'recipient')),
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_read_at TIMESTAMP,
  UNIQUE (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS admin_conversation_participant_user_idx
  ON public.admin_conversation_participant (user_id, joined_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_communication_message (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES public.admin_conversation(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE RESTRICT,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_communication_message_conversation_idx
  ON public.admin_communication_message (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_communication_message_sender_idx
  ON public.admin_communication_message (sender_id, created_at DESC);

COMMIT;
