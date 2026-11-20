-- Evidence-only batch traceability summaries and chronological stage history.
BEGIN;

ALTER TABLE public.industrial_event
  ADD COLUMN IF NOT EXISTS stage_code TEXT,
  ADD COLUMN IF NOT EXISTS stage_sequence_number INTEGER;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.industrial_batch_evidence (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES public.production_batch(id) ON DELETE CASCADE,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  machine_reported_quantity NUMERIC(24,6),
  machine_rejected_quantity NUMERIC(24,6),
  last_machine_counter NUMERIC(24,6),
  event_count INTEGER NOT NULL DEFAULT 0,
  counter_reset_count INTEGER NOT NULL DEFAULT 0,
  first_event_at TIMESTAMP,
  last_event_at TIMESTAMP,
  verification_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT industrial_batch_evidence_batch_uniq UNIQUE (batch_id),
  CONSTRAINT industrial_batch_evidence_status_check CHECK (verification_status IN ('pending', 'supported', 'discrepant', 'insufficient_evidence')),
  CONSTRAINT industrial_batch_evidence_event_count_check CHECK (event_count >= 0),
  CONSTRAINT industrial_batch_evidence_reset_count_check CHECK (counter_reset_count >= 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_batch_evidence_manufacturer_status_idx ON public.industrial_batch_evidence (manufacturer_id, verification_status);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.industrial_batch_stage_history (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES public.production_batch(id) ON DELETE CASCADE,
  manufacturer_id TEXT NOT NULL REFERENCES public."user"(id),
  event_id TEXT NOT NULL REFERENCES public.industrial_event(id),
  stage_code TEXT NOT NULL,
  stage_name TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  event_timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT industrial_batch_stage_event_uniq UNIQUE (event_id),
  CONSTRAINT industrial_batch_stage_status_check CHECK (status IN ('started', 'completed', 'failed')),
  CONSTRAINT industrial_batch_stage_sequence_positive_check CHECK (sequence_number > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS industrial_batch_stage_history_batch_idx ON public.industrial_batch_stage_history (batch_id, sequence_number, event_timestamp);

COMMIT;
