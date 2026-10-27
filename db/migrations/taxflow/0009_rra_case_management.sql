CREATE TABLE IF NOT EXISTS rra_case (
  id TEXT PRIMARY KEY,
  trader_id TEXT NOT NULL REFERENCES "user"(id),
  title TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'awaiting_information', 'closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_staff_id TEXT REFERENCES rra_staff(id) ON DELETE SET NULL,
  created_by_staff_id TEXT REFERENCES rra_staff(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS rra_case_status_updated_idx ON rra_case (status, updated_at);
CREATE INDEX IF NOT EXISTS rra_case_trader_created_idx ON rra_case (trader_id, created_at);
CREATE INDEX IF NOT EXISTS rra_case_assigned_status_idx ON rra_case (assigned_staff_id, status);

CREATE TABLE IF NOT EXISTS rra_case_event (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES rra_case(id) ON DELETE CASCADE,
  actor_staff_id TEXT REFERENCES rra_staff(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  note TEXT,
  from_value TEXT,
  to_value TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rra_case_event_case_created_idx ON rra_case_event (case_id, created_at);

-- Preserve existing audit openings as individual cases instead of grouping by trader.
INSERT INTO rra_case (id, trader_id, title, reason, status, priority, created_by_staff_id, created_at, updated_at)
SELECT
  'legacy-' || al.id,
  al.target_id,
  'Legacy compliance audit',
  'Migrated legacy audit record; see its audit log entry for the original details.',
  'open',
  'normal',
  rs.id,
  al.created_at,
  al.created_at
FROM audit_log al
JOIN "user" trader ON trader.id = al.target_id
LEFT JOIN rra_staff rs ON rs.user_id = al.user_id
WHERE al.action = 'AUDIT_OPENED'
  AND al.target_type = 'user'
  AND trader.role IN ('manufacturer', 'wholesaler', 'retailer')
  AND NOT EXISTS (SELECT 1 FROM rra_case c WHERE c.id = 'legacy-' || al.id);

INSERT INTO rra_case_event (id, case_id, actor_staff_id, event_type, note, to_value, created_at)
SELECT 'legacy-event-' || al.id, 'legacy-' || al.id, rs.id, 'case_opened',
       'Migrated from the audit log; consult the legacy record for original details.', 'open', al.created_at
FROM audit_log al
LEFT JOIN rra_staff rs ON rs.user_id = al.user_id
WHERE al.action = 'AUDIT_OPENED'
  AND al.target_type = 'user'
  AND EXISTS (SELECT 1 FROM rra_case c WHERE c.id = 'legacy-' || al.id)
  AND NOT EXISTS (SELECT 1 FROM rra_case_event e WHERE e.id = 'legacy-event-' || al.id);
