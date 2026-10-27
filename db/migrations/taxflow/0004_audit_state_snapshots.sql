ALTER TABLE "audit_log"
  ADD COLUMN "before_state" jsonb,
  ADD COLUMN "after_state" jsonb;
