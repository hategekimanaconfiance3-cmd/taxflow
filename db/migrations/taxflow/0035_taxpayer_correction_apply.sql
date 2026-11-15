-- Migration 0035: Add applied-correction tracking to taxpayer_correction_request
-- Applied-correction columns (nullable until a correction is actually applied)
ALTER TABLE taxpayer_correction_request
  ADD COLUMN IF NOT EXISTS applied_value     text,
  ADD COLUMN IF NOT EXISTS applied_by_user_id text REFERENCES "user"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS applied_at        timestamptz;

-- Extend the status check to include the new 'applied' terminal state
ALTER TABLE taxpayer_correction_request
  DROP CONSTRAINT IF EXISTS taxpayer_correction_status_check;

ALTER TABLE taxpayer_correction_request
  ADD CONSTRAINT taxpayer_correction_status_check
  CHECK (status IN (
    'submitted', 'under_review', 'awaiting_evidence',
    'recommended_approval', 'recommended_rejection', 'applied'
  ));
