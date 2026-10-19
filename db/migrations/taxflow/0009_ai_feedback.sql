-- Metadata-only AI feedback. Do not store prompts, responses, or free-text notes.
CREATE TABLE IF NOT EXISTS ai_feedback (
  id TEXT PRIMARY KEY,
  submitted_by_id TEXT NOT NULL REFERENCES "user"(id),
  staff_role TEXT NOT NULL,
  message_hash TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('helpful', 'not_helpful')),
  issue_category TEXT CHECK (issue_category IS NULL OR issue_category IN ('incorrect', 'incomplete', 'unsupported', 'wrong_tool', 'unsafe', 'other')),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'reviewed')),
  review_outcome TEXT CHECK (review_outcome IS NULL OR review_outcome IN ('added_to_eval', 'no_action', 'duplicate', 'follow_up')),
  reviewed_by_id TEXT REFERENCES "user"(id),
  reviewed_at TIMESTAMP,
  model_version TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_feedback_category_rating_check CHECK (
    (rating = 'helpful' AND issue_category IS NULL) OR
    (rating = 'not_helpful' AND issue_category IS NOT NULL)
  ),
  CONSTRAINT ai_feedback_review_state_check CHECK (
    (review_status = 'pending' AND review_outcome IS NULL AND reviewed_by_id IS NULL AND reviewed_at IS NULL) OR
    (review_status = 'reviewed' AND review_outcome IS NOT NULL AND reviewed_by_id IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_feedback_submitter_message_unique
  ON ai_feedback (submitted_by_id, message_hash);
CREATE INDEX IF NOT EXISTS ai_feedback_status_created_idx
  ON ai_feedback (review_status, created_at);
