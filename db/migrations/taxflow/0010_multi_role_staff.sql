CREATE TABLE IF NOT EXISTS rra_staff_role (
  id TEXT PRIMARY KEY,
  staff_record_id TEXT NOT NULL REFERENCES rra_staff(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  assigned_by TEXT REFERENCES "user"(id),
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT rra_staff_role_staff_role_uniq UNIQUE (staff_record_id, role)
);

CREATE INDEX IF NOT EXISTS rra_staff_role_role_idx ON rra_staff_role(role);

-- Preserve every existing worker's access as their initial assigned role.
INSERT INTO rra_staff_role (id, staff_record_id, role, assigned_by)
SELECT id || ':' || clearance_level, id, clearance_level, assigned_by
FROM rra_staff
ON CONFLICT (staff_record_id, role) DO NOTHING;
