-- Controlled factory integration requests, provisioning, signed gateway requests,
-- one-time credential delivery, and equipment authorization.
-- This migration adds integration evidence only; it does not change stock, tax,
-- invoice, payment, or production-approval workflows.
BEGIN;

CREATE TABLE IF NOT EXISTS public.industrial_integration_request (
  id TEXT PRIMARY KEY,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  factory_id TEXT NOT NULL REFERENCES public.factory(id),
  environment TEXT NOT NULL,
  integration_name TEXT NOT NULL,
  requested_equipment_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  gateway_name TEXT,
  notes TEXT,
  client_request_id TEXT,
  status TEXT NOT NULL DEFAULT 'requested',
  reviewed_by_user_id TEXT REFERENCES public."user"(id),
  reviewed_at TIMESTAMP,
  review_note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT industrial_integration_request_environment_check CHECK (environment IN ('sandbox', 'production')),
  CONSTRAINT industrial_integration_request_status_check CHECK (status IN ('requested', 'under_review', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_integration_request_manufacturer_idx ON public.industrial_integration_request (manufacturer_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_integration_request_factory_idx ON public.industrial_integration_request (factory_id, status);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS industrial_integration_request_client_id_uniq ON public.industrial_integration_request (manufacturer_id, client_request_id) WHERE client_request_id IS NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.industrial_integration (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE REFERENCES public.industrial_integration_request(id),
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  factory_id TEXT NOT NULL REFERENCES public.factory(id),
  integration_code TEXT NOT NULL UNIQUE,
  environment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'provisioning',
  auth_mode TEXT NOT NULL DEFAULT 'signed_ed25519',
  requires_credential_reissue BOOLEAN NOT NULL DEFAULT FALSE,
  activated_at TIMESTAMP,
  suspended_at TIMESTAMP,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT industrial_integration_environment_check CHECK (environment IN ('sandbox', 'production')),
  CONSTRAINT industrial_integration_status_check CHECK (status IN ('provisioning', 'provisioned', 'active', 'suspended', 'revoked')),
  CONSTRAINT industrial_integration_auth_mode_check CHECK (auth_mode IN ('signed_ed25519', 'bearer_legacy'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_integration_manufacturer_status_idx ON public.industrial_integration (manufacturer_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_integration_factory_environment_idx ON public.industrial_integration (factory_id, environment);
--> statement-breakpoint

ALTER TABLE public.industrial_gateway ADD COLUMN IF NOT EXISTS integration_id TEXT REFERENCES public.industrial_integration(id);
--> statement-breakpoint
ALTER TABLE public.industrial_gateway ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'production';
--> statement-breakpoint
ALTER TABLE public.industrial_gateway ADD COLUMN IF NOT EXISTS auth_mode TEXT NOT NULL DEFAULT 'bearer_legacy';
--> statement-breakpoint
ALTER TABLE public.industrial_gateway ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manufacturer_gateway';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_gateway_integration_idx ON public.industrial_gateway (integration_id, status);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'industrial_gateway_environment_check') THEN
    ALTER TABLE public.industrial_gateway ADD CONSTRAINT industrial_gateway_environment_check CHECK (environment IN ('sandbox', 'production'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'industrial_gateway_auth_mode_check') THEN
    ALTER TABLE public.industrial_gateway ADD CONSTRAINT industrial_gateway_auth_mode_check CHECK (auth_mode IN ('signed_ed25519', 'bearer_legacy'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'industrial_gateway_source_type_check') THEN
    ALTER TABLE public.industrial_gateway ADD CONSTRAINT industrial_gateway_source_type_check CHECK (source_type IN ('manufacturer_gateway', 'simulator'));
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE public.industrial_gateway_credential ADD COLUMN IF NOT EXISTS public_signing_key TEXT;
--> statement-breakpoint
ALTER TABLE public.industrial_gateway_credential ADD COLUMN IF NOT EXISTS signing_algorithm TEXT;
--> statement-breakpoint
ALTER TABLE public.industrial_gateway_credential ADD COLUMN IF NOT EXISTS issuance_reason TEXT;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'industrial_gateway_credential_signing_algorithm_check') THEN
    ALTER TABLE public.industrial_gateway_credential ADD CONSTRAINT industrial_gateway_credential_signing_algorithm_check CHECK (signing_algorithm IS NULL OR signing_algorithm IN ('ed25519'));
  END IF;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.industrial_integration_equipment (
  id TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL REFERENCES public.industrial_integration(id) ON DELETE CASCADE,
  equipment_id TEXT NOT NULL REFERENCES public.industrial_equipment(id),
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  factory_id TEXT NOT NULL REFERENCES public.factory(id),
  authorization_status TEXT NOT NULL DEFAULT 'authorized',
  authorized_by_user_id TEXT REFERENCES public."user"(id),
  authorized_at TIMESTAMP,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT industrial_integration_equipment_uniq UNIQUE (integration_id, equipment_id),
  CONSTRAINT industrial_integration_equipment_status_check CHECK (authorization_status IN ('pending', 'authorized', 'revoked'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_integration_equipment_factory_idx ON public.industrial_integration_equipment (factory_id, authorization_status);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.industrial_credential_delivery (
  id TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL REFERENCES public.industrial_integration(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE REFERENCES public.industrial_gateway_credential(id) ON DELETE CASCADE,
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  encryption_key_version TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  claimed_at TIMESTAMP,
  claimed_by_user_id TEXT REFERENCES public."user"(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_credential_delivery_integration_idx ON public.industrial_credential_delivery (integration_id, claimed_at, expires_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.industrial_gateway_request_nonce (
  id TEXT PRIMARY KEY,
  gateway_id TEXT NOT NULL REFERENCES public.industrial_gateway(id) ON DELETE CASCADE,
  nonce TEXT NOT NULL,
  observed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  CONSTRAINT industrial_gateway_request_nonce_uniq UNIQUE (gateway_id, nonce)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_gateway_request_nonce_expiry_idx ON public.industrial_gateway_request_nonce (expires_at);

COMMIT;
