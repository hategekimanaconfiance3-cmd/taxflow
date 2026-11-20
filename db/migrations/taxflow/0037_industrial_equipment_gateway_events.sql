-- Industrial equipment, gateway identity, and evidence-only event foundation.
-- No table in this migration writes stock, tax, or production approval state.
BEGIN;

CREATE TABLE IF NOT EXISTS public.industrial_equipment (
  id TEXT PRIMARY KEY,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  factory_id TEXT NOT NULL REFERENCES public.factory(id),
  production_line_id TEXT NOT NULL REFERENCES public.factory_production_line(id),
  equipment_code TEXT NOT NULL,
  name TEXT NOT NULL,
  equipment_type TEXT NOT NULL,
  equipment_manufacturer TEXT,
  model TEXT,
  serial_number TEXT,
  installation_date TIMESTAMP,
  operational_status TEXT NOT NULL DEFAULT 'registered',
  communication_protocol TEXT NOT NULL DEFAULT 'unknown',
  integration_method TEXT NOT NULL DEFAULT 'gateway',
  sensor_configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  measurement_units JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_production_capacity NUMERIC(24,6),
  expected_production_capacity_unit TEXT,
  calibration_status TEXT NOT NULL DEFAULT 'pending',
  last_calibration_date TIMESTAMP,
  next_calibration_date TIMESTAMP,
  last_communication_at TIMESTAMP,
  removed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT industrial_equipment_factory_code_uniq UNIQUE (factory_id, equipment_code),
  CONSTRAINT industrial_equipment_operational_status_check CHECK (operational_status IN ('registered', 'active', 'maintenance', 'inactive', 'removed')),
  CONSTRAINT industrial_equipment_protocol_check CHECK (communication_protocol IN ('unknown', 'opc_ua', 'modbus_tcp', 'modbus_rtu', 'industrial_ethernet', 'vendor_api', 'erp_mes', 'scada_historian', 'other')),
  CONSTRAINT industrial_equipment_integration_method_check CHECK (integration_method IN ('gateway', 'api', 'manual_evidence', 'pending')),
  CONSTRAINT industrial_equipment_calibration_status_check CHECK (calibration_status IN ('pending', 'valid', 'due', 'expired', 'not_required')),
  CONSTRAINT industrial_equipment_capacity_pair_check CHECK ((expected_production_capacity IS NULL AND expected_production_capacity_unit IS NULL) OR (expected_production_capacity > 0 AND expected_production_capacity_unit IS NOT NULL AND length(trim(expected_production_capacity_unit)) > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS industrial_equipment_manufacturer_serial_uniq ON public.industrial_equipment (manufacturer_id, serial_number) WHERE serial_number IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_equipment_line_status_idx ON public.industrial_equipment (production_line_id, operational_status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_equipment_calibration_idx ON public.industrial_equipment (calibration_status, next_calibration_date);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.industrial_gateway (
  id TEXT PRIMARY KEY,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  factory_id TEXT NOT NULL REFERENCES public.factory(id),
  gateway_code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  software_version TEXT,
  last_heartbeat_at TIMESTAMP,
  last_sync_at TIMESTAMP,
  last_error_at TIMESTAMP,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT industrial_gateway_manufacturer_code_uniq UNIQUE (manufacturer_id, gateway_code),
  CONSTRAINT industrial_gateway_status_check CHECK (status IN ('pending', 'active', 'suspended', 'revoked'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_gateway_factory_status_idx ON public.industrial_gateway (factory_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_gateway_health_idx ON public.industrial_gateway (status, last_heartbeat_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.industrial_gateway_credential (
  id TEXT PRIMARY KEY,
  gateway_id TEXT NOT NULL REFERENCES public.industrial_gateway(id) ON DELETE CASCADE,
  credential_type TEXT NOT NULL DEFAULT 'api_secret',
  credential_version INTEGER NOT NULL,
  credential_hash TEXT NOT NULL,
  public_fingerprint TEXT,
  issued_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP,
  revoked_at TIMESTAMP,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT industrial_gateway_credential_version_uniq UNIQUE (gateway_id, credential_version),
  CONSTRAINT industrial_gateway_credential_type_check CHECK (credential_type IN ('api_secret', 'mtls_certificate')),
  CONSTRAINT industrial_gateway_credential_version_check CHECK (credential_version > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_gateway_credential_active_idx ON public.industrial_gateway_credential (gateway_id, revoked_at, expires_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.industrial_gateway_connection (
  id TEXT PRIMARY KEY,
  gateway_id TEXT NOT NULL REFERENCES public.industrial_gateway(id) ON DELETE CASCADE,
  connection_type TEXT NOT NULL,
  protocol TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown',
  connected_at TIMESTAMP,
  disconnected_at TIMESTAMP,
  last_seen_at TIMESTAMP,
  error_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT industrial_gateway_connection_status_check CHECK (status IN ('unknown', 'connected', 'degraded', 'disconnected', 'error'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_gateway_connection_gateway_idx ON public.industrial_gateway_connection (gateway_id, status);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.industrial_event (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  gateway_id TEXT NOT NULL REFERENCES public.industrial_gateway(id),
  factory_id TEXT NOT NULL REFERENCES public.factory(id),
  production_line_id TEXT NOT NULL REFERENCES public.factory_production_line(id),
  equipment_id TEXT NOT NULL REFERENCES public.industrial_equipment(id),
  batch_id TEXT REFERENCES public.production_batch(id),
  event_type TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  event_timestamp TIMESTAMP NOT NULL,
  received_timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  measurements JSONB NOT NULL DEFAULT '{}'::jsonb,
  unit TEXT,
  source TEXT NOT NULL DEFAULT 'industrial_gateway',
  schema_version TEXT NOT NULL,
  original_payload JSONB NOT NULL,
  normalized_payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  validation_status TEXT NOT NULL DEFAULT 'accepted',
  integrity_status TEXT NOT NULL DEFAULT 'verified',
  synchronization_status TEXT NOT NULL DEFAULT 'received',
  sequence_status TEXT NOT NULL DEFAULT 'in_order',
  counter_status TEXT NOT NULL DEFAULT 'normal',
  is_simulated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT industrial_event_gateway_event_id_uniq UNIQUE (gateway_id, event_id),
  CONSTRAINT industrial_event_sequence_positive_check CHECK (sequence_number > 0),
  CONSTRAINT industrial_event_validation_status_check CHECK (validation_status IN ('accepted', 'rejected', 'duplicate')),
  CONSTRAINT industrial_event_integrity_status_check CHECK (integrity_status IN ('verified', 'unverified', 'failed')),
  CONSTRAINT industrial_event_sync_status_check CHECK (synchronization_status IN ('received', 'acknowledged', 'failed')),
  CONSTRAINT industrial_event_sequence_status_check CHECK (sequence_status IN ('in_order', 'out_of_order', 'gap', 'duplicate')),
  CONSTRAINT industrial_event_counter_status_check CHECK (counter_status IN ('normal', 'reset', 'rollover', 'decreased'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_event_equipment_sequence_idx ON public.industrial_event (equipment_id, sequence_number);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_event_factory_received_idx ON public.industrial_event (factory_id, received_timestamp);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_event_batch_timestamp_idx ON public.industrial_event (batch_id, event_timestamp);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_event_sync_status_idx ON public.industrial_event (synchronization_status, received_timestamp);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.industrial_event_sequence (
  id TEXT PRIMARY KEY,
  gateway_id TEXT NOT NULL REFERENCES public.industrial_gateway(id) ON DELETE CASCADE,
  equipment_id TEXT NOT NULL REFERENCES public.industrial_equipment(id) ON DELETE CASCADE,
  last_sequence_number INTEGER NOT NULL,
  last_counter_value REAL,
  last_event_timestamp TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT industrial_event_sequence_gateway_equipment_uniq UNIQUE (gateway_id, equipment_id),
  CONSTRAINT industrial_event_sequence_last_positive_check CHECK (last_sequence_number > 0)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.industrial_event_sync (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES public.industrial_event(id) ON DELETE CASCADE,
  gateway_id TEXT NOT NULL REFERENCES public.industrial_gateway(id) ON DELETE CASCADE,
  sync_status TEXT NOT NULL DEFAULT 'received',
  attempt_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT industrial_event_sync_event_uniq UNIQUE (event_id),
  CONSTRAINT industrial_event_sync_status_check CHECK (sync_status IN ('received', 'acknowledged', 'failed')),
  CONSTRAINT industrial_event_sync_attempt_check CHECK (attempt_count > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_event_sync_gateway_status_idx ON public.industrial_event_sync (gateway_id, sync_status);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.industrial_equipment_calibration (
  id TEXT PRIMARY KEY,
  equipment_id TEXT NOT NULL REFERENCES public.industrial_equipment(id) ON DELETE CASCADE,
  calibration_reference TEXT NOT NULL,
  status TEXT NOT NULL,
  calibrated_at TIMESTAMP NOT NULL,
  next_calibration_at TIMESTAMP,
  certificate_reference TEXT,
  notes TEXT,
  performed_by_user_id TEXT NOT NULL REFERENCES public."user"(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT industrial_calibration_equipment_reference_uniq UNIQUE (equipment_id, calibration_reference),
  CONSTRAINT industrial_calibration_status_check CHECK (status IN ('valid', 'failed', 'superseded'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_calibration_equipment_date_idx ON public.industrial_equipment_calibration (equipment_id, next_calibration_at);

COMMIT;
