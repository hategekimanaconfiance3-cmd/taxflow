-- Industrial Machine Integration: factories, production lines, equipment, gateways, events, verifications, alerts
-- Migration 0037

CREATE TABLE "factory" (
  "id" text PRIMARY KEY,
  "manufacturer_id" text NOT NULL REFERENCES "user"("id"),
  "name" text NOT NULL,
  "location" text NOT NULL,
  "province" text,
  "district" text,
  "registration_number" text UNIQUE,
  "status" text NOT NULL DEFAULT 'pending',
  "approved_by_user_id" text REFERENCES "user"("id"),
  "approved_at" timestamp,
  "suspended_at" timestamp,
  "suspension_reason" text,
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "factory_status_check" CHECK ("status" IN ('pending','approved','suspended','decommissioned'))
);

CREATE INDEX "factory_manufacturer_idx" ON "factory"("manufacturer_id");
CREATE INDEX "factory_status_idx" ON "factory"("status");

CREATE TABLE "production_line" (
  "id" text PRIMARY KEY,
  "factory_id" text NOT NULL REFERENCES "factory"("id"),
  "manufacturer_id" text NOT NULL REFERENCES "user"("id"),
  "name" text NOT NULL,
  "line_code" text NOT NULL,
  "description" text,
  "capacity" real,
  "capacity_unit" text,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "production_line_status_check" CHECK ("status" IN ('active','maintenance','decommissioned'))
);

CREATE INDEX "production_line_factory_idx" ON "production_line"("factory_id");
CREATE INDEX "production_line_manufacturer_idx" ON "production_line"("manufacturer_id");
CREATE UNIQUE INDEX "production_line_factory_code_uniq" ON "production_line"("factory_id","line_code");

CREATE TABLE "industrial_equipment" (
  "id" text PRIMARY KEY,
  "production_line_id" text NOT NULL REFERENCES "production_line"("id"),
  "manufacturer_id" text NOT NULL REFERENCES "user"("id"),
  "name" text NOT NULL,
  "equipment_code" text NOT NULL,
  "equipment_type" text NOT NULL,
  "serial_number" text,
  "manufacturer" text,
  "model" text,
  "installed_at" timestamp,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "industrial_equipment_type_check" CHECK ("equipment_type" IN ('mixer','filler','labeler','conveyor','sensor','scale','other')),
  CONSTRAINT "industrial_equipment_status_check" CHECK ("status" IN ('active','maintenance','offline','decommissioned'))
);

CREATE INDEX "industrial_equipment_line_idx" ON "industrial_equipment"("production_line_id");
CREATE INDEX "industrial_equipment_manufacturer_idx" ON "industrial_equipment"("manufacturer_id");
CREATE UNIQUE INDEX "industrial_equipment_manufacturer_code_uniq" ON "industrial_equipment"("manufacturer_id","equipment_code");

CREATE TABLE "industrial_gateway" (
  "id" text PRIMARY KEY,
  "manufacturer_id" text NOT NULL REFERENCES "user"("id"),
  "factory_id" text NOT NULL REFERENCES "factory"("id"),
  "name" text NOT NULL,
  "gateway_id" text NOT NULL UNIQUE,
  "protocol" text NOT NULL DEFAULT 'https',
  "api_key_hash" text,
  "last_seen_at" timestamp,
  "status" text NOT NULL DEFAULT 'pending',
  "approved_by_user_id" text REFERENCES "user"("id"),
  "approved_at" timestamp,
  "revoked_at" timestamp,
  "revocation_reason" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "industrial_gateway_status_check" CHECK ("status" IN ('pending','active','revoked','offline'))
);

CREATE INDEX "industrial_gateway_manufacturer_idx" ON "industrial_gateway"("manufacturer_id");
CREATE INDEX "industrial_gateway_factory_idx" ON "industrial_gateway"("factory_id");
CREATE INDEX "industrial_gateway_status_idx" ON "industrial_gateway"("status");

CREATE TABLE "industrial_event" (
  "id" text PRIMARY KEY,
  "gateway_id" text NOT NULL REFERENCES "industrial_gateway"("id"),
  "manufacturer_id" text NOT NULL REFERENCES "user"("id"),
  "factory_id" text NOT NULL REFERENCES "factory"("id"),
  "production_line_id" text REFERENCES "production_line"("id"),
  "equipment_id" text REFERENCES "industrial_equipment"("id"),
  "event_type" text NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}',
  "production_batch_id" text REFERENCES "production_batch"("id"),
  "event_timestamp" timestamp NOT NULL,
  "received_at" timestamp NOT NULL DEFAULT now(),
  "processed_at" timestamp,
  "processing_status" text NOT NULL DEFAULT 'received',
  "anomaly_score" real,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "industrial_event_type_check" CHECK ("event_type" IN ('production_count','weight_reading','line_start','line_stop','reject_count','downtime','sensor_reading','batch_tag')),
  CONSTRAINT "industrial_event_processing_status_check" CHECK ("processing_status" IN ('received','processed','anomaly_flagged','ignored'))
);

CREATE INDEX "industrial_event_manufacturer_time_idx" ON "industrial_event"("manufacturer_id","event_timestamp");
CREATE INDEX "industrial_event_batch_idx" ON "industrial_event"("production_batch_id");
CREATE INDEX "industrial_event_gateway_time_idx" ON "industrial_event"("gateway_id","event_timestamp");
CREATE INDEX "industrial_event_processing_status_idx" ON "industrial_event"("processing_status");

CREATE TABLE "production_verification" (
  "id" text PRIMARY KEY,
  "production_batch_id" text NOT NULL UNIQUE REFERENCES "production_batch"("id"),
  "manufacturer_id" text NOT NULL REFERENCES "user"("id"),
  "verification_status" text NOT NULL DEFAULT 'pending',
  "declared_quantity" real NOT NULL,
  "industrial_quantity" real,
  "reported_quantity" real,
  "discrepancy_percent" real,
  "discrepancy_threshold_basis_points" integer NOT NULL DEFAULT 500,
  "alert_raised" boolean NOT NULL DEFAULT false,
  "alert_raised_at" timestamp,
  "verified_by_user_id" text REFERENCES "user"("id"),
  "verified_at" timestamp,
  "verification_note" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "production_verification_status_check" CHECK ("verification_status" IN ('pending','verified','discrepancy_flagged','investigation'))
);

CREATE INDEX "production_verification_manufacturer_status_idx" ON "production_verification"("manufacturer_id","verification_status");
CREATE INDEX "production_verification_alert_idx" ON "production_verification"("alert_raised");

CREATE TABLE "industrial_alert" (
  "id" text PRIMARY KEY,
  "manufacturer_id" text NOT NULL REFERENCES "user"("id"),
  "alert_type" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'medium',
  "title" text NOT NULL,
  "description" text NOT NULL,
  "related_entity_type" text,
  "related_entity_id" text,
  "production_verification_id" text REFERENCES "production_verification"("id"),
  "status" text NOT NULL DEFAULT 'open',
  "acknowledged_by_user_id" text REFERENCES "user"("id"),
  "acknowledged_at" timestamp,
  "resolved_by_user_id" text REFERENCES "user"("id"),
  "resolved_at" timestamp,
  "resolution_note" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "industrial_alert_type_check" CHECK ("alert_type" IN ('production_discrepancy','gateway_offline','equipment_fault','anomaly_detected','unreported_production')),
  CONSTRAINT "industrial_alert_severity_check" CHECK ("severity" IN ('low','medium','high','critical')),
  CONSTRAINT "industrial_alert_status_check" CHECK ("status" IN ('open','acknowledged','resolved','dismissed'))
);

CREATE INDEX "industrial_alert_manufacturer_status_idx" ON "industrial_alert"("manufacturer_id","status");
CREATE INDEX "industrial_alert_type_severity_idx" ON "industrial_alert"("alert_type","severity");
CREATE INDEX "industrial_alert_status_idx" ON "industrial_alert"("status");
