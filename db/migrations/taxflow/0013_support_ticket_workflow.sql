BEGIN;

-- The legacy support table is present in existing deployments created via
-- Drizzle schema push, but not in every historical SQL migration baseline.
-- Create its original shape for fresh databases before applying workflow fields.
CREATE TABLE IF NOT EXISTS support_ticket (
  id TEXT PRIMARY KEY NOT NULL,
  trader_id TEXT NOT NULL REFERENCES "user"(id),
  category TEXT NOT NULL DEFAULT 'general',
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  assigned_to_id TEXT REFERENCES "user"(id),
  resolution TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS support_ticket_trader_idx ON support_ticket (trader_id);
CREATE INDEX IF NOT EXISTS support_ticket_status_idx ON support_ticket (status);
CREATE INDEX IF NOT EXISTS support_ticket_assigned_idx ON support_ticket (assigned_to_id);

ALTER TABLE support_ticket ADD COLUMN IF NOT EXISTS ticket_reference TEXT;
ALTER TABLE support_ticket ADD COLUMN IF NOT EXISTS assigned_department TEXT;
ALTER TABLE support_ticket ADD COLUMN IF NOT EXISTS resolution_category TEXT;
ALTER TABLE support_ticket ADD COLUMN IF NOT EXISTS resolved_by_id TEXT REFERENCES "user"(id);
ALTER TABLE support_ticket ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMP;
ALTER TABLE support_ticket ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP;
ALTER TABLE support_ticket ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMP;

WITH numbered_tickets AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS ticket_number
  FROM support_ticket
  WHERE ticket_reference IS NULL
)
UPDATE support_ticket AS ticket
SET ticket_reference = 'TKT-' || LPAD(numbered_tickets.ticket_number::TEXT, 6, '0')
FROM numbered_tickets
WHERE ticket.id = numbered_tickets.id;

ALTER TABLE support_ticket ALTER COLUMN ticket_reference SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS support_ticket_reference_unique ON support_ticket (ticket_reference);
CREATE INDEX IF NOT EXISTS support_ticket_department_status_idx ON support_ticket (assigned_department, status);
CREATE INDEX IF NOT EXISTS support_ticket_updated_idx ON support_ticket (updated_at);

CREATE TABLE IF NOT EXISTS support_ticket_message (
  id TEXT PRIMARY KEY NOT NULL,
  ticket_id TEXT NOT NULL REFERENCES support_ticket(id) ON DELETE CASCADE,
  sender_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS support_ticket_message_ticket_created_idx
  ON support_ticket_message (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS support_ticket_internal_note (
  id TEXT PRIMARY KEY NOT NULL,
  ticket_id TEXT NOT NULL REFERENCES support_ticket(id) ON DELETE CASCADE,
  author_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  category TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS support_ticket_internal_note_ticket_created_idx
  ON support_ticket_internal_note (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS support_ticket_event (
  id TEXT PRIMARY KEY NOT NULL,
  ticket_id TEXT NOT NULL REFERENCES support_ticket(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  details JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS support_ticket_event_ticket_created_idx
  ON support_ticket_event (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS support_ticket_event_actor_idx
  ON support_ticket_event (actor_user_id, created_at);

INSERT INTO support_ticket_event (id, ticket_id, actor_user_id, event_type, new_status, created_at)
SELECT 'legacy-created-' || id, id, trader_id, 'ticket_created', status, created_at
FROM support_ticket
ON CONFLICT (id) DO NOTHING;

COMMIT;
