-- Migration 0045: Anomaly investigation tracking and audit trail
BEGIN;

CREATE TABLE IF NOT EXISTS "anomaly_investigation" (
  "id" TEXT PRIMARY KEY,
  "anomaly_key" TEXT NOT NULL UNIQUE,
  "anomaly_type" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "assigned_to_user_id" TEXT,
  "assigned_at" TIMESTAMP,
  "investigated_by_user_id" TEXT,
  "investigation_started_at" TIMESTAMP,
  "resolved_by_user_id" TEXT,
  "resolved_at" TIMESTAMP,
  "resolution_reason" TEXT,
  "is_false_positive" BOOLEAN NOT NULL DEFAULT FALSE,
  "notes" TEXT,
  "escalated_to_user_id" TEXT,
  "escalated_at" TIMESTAMP,
  "reopened_at" TIMESTAMP,
  "seller_name" TEXT,
  "product_name" TEXT,
  "description" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "anomaly_investigation_status_check" CHECK ("status" IN ('open','under_investigation','resolved','false_positive','escalated'))
);

CREATE INDEX IF NOT EXISTS "anomaly_investigation_status_idx"
  ON "anomaly_investigation" ("status", "created_at");

CREATE INDEX IF NOT EXISTS "anomaly_investigation_assigned_idx"
  ON "anomaly_investigation" ("assigned_to_user_id", "status");

CREATE TABLE IF NOT EXISTS "anomaly_audit_log" (
  "id" TEXT PRIMARY KEY,
  "anomaly_id" TEXT NOT NULL REFERENCES "anomaly_investigation"("id") ON DELETE CASCADE,
  "actor_user_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "previous_status" TEXT,
  "new_status" TEXT,
  "note" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "anomaly_audit_log_anomaly_idx"
  ON "anomaly_audit_log" ("anomaly_id", "created_at");

COMMIT;
