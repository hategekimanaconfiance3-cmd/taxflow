CREATE UNIQUE INDEX IF NOT EXISTS "rra_staff_staff_id_ci_unique"
  ON "rra_staff" (lower("staff_id"));
