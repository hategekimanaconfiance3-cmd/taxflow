-- Phase 3B.1 additive B2B acceptance, dispatch, receipt, and representative evidence.
-- No legacy records are backfilled; no VAT or stock data is changed by this migration.
BEGIN;

CREATE TABLE IF NOT EXISTS business_representative (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES "user"(id),
  representative_user_id TEXT NOT NULL REFERENCES "user"(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'revoked')),
  invited_by_user_id TEXT NOT NULL REFERENCES "user"(id),
  invited_at TIMESTAMP NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMP,
  revoked_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT business_representative_not_owner_check CHECK (business_id <> representative_user_id),
  CONSTRAINT business_representative_business_user_uniq UNIQUE (business_id, representative_user_id)
);
CREATE INDEX IF NOT EXISTS business_representative_user_status_idx ON business_representative (representative_user_id, status);

CREATE TABLE IF NOT EXISTS b2b_order_acceptance (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL UNIQUE REFERENCES "transaction"(id),
  buyer_business_id TEXT NOT NULL REFERENCES "user"(id),
  actor_user_id TEXT NOT NULL REFERENCES "user"(id),
  accepted_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS b2b_order_acceptance_buyer_time_idx ON b2b_order_acceptance (buyer_business_id, accepted_at);

CREATE TABLE IF NOT EXISTS b2b_dispatch (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES "transaction"(id),
  seller_business_id TEXT NOT NULL REFERENCES "user"(id),
  actor_user_id TEXT NOT NULL REFERENCES "user"(id),
  quantity REAL NOT NULL CHECK (quantity > 0),
  dispatch_reference TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT b2b_dispatch_transaction_key_uniq UNIQUE (transaction_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS b2b_dispatch_transaction_created_idx ON b2b_dispatch (transaction_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS b2b_dispatch_business_reference_uniq ON b2b_dispatch (seller_business_id, dispatch_reference);

CREATE TABLE IF NOT EXISTS b2b_receipt (
  id TEXT PRIMARY KEY,
  dispatch_id TEXT NOT NULL REFERENCES b2b_dispatch(id),
  transaction_id TEXT NOT NULL REFERENCES "transaction"(id),
  buyer_business_id TEXT NOT NULL REFERENCES "user"(id),
  actor_user_id TEXT NOT NULL REFERENCES "user"(id),
  quantity_received REAL NOT NULL CHECK (quantity_received > 0),
  accepted_quantity REAL NOT NULL CHECK (accepted_quantity >= 0),
  damaged_quantity REAL NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0),
  rejected_quantity REAL NOT NULL DEFAULT 0 CHECK (rejected_quantity >= 0),
  disputed_quantity REAL NOT NULL DEFAULT 0 CHECK (disputed_quantity >= 0),
  notes TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT b2b_receipt_dispatch_key_uniq UNIQUE (dispatch_id, idempotency_key),
  CONSTRAINT b2b_receipt_classification_total_check CHECK (abs(accepted_quantity + damaged_quantity + rejected_quantity + disputed_quantity - quantity_received) < 0.000001)
);
CREATE INDEX IF NOT EXISTS b2b_receipt_transaction_created_idx ON b2b_receipt (transaction_id, created_at);

CREATE OR REPLACE FUNCTION reject_b2b_evidence_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'B2B fulfillment evidence rows are immutable';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS b2b_order_acceptance_immutable ON b2b_order_acceptance;
CREATE TRIGGER b2b_order_acceptance_immutable BEFORE UPDATE OR DELETE ON b2b_order_acceptance
  FOR EACH ROW EXECUTE FUNCTION reject_b2b_evidence_mutation();
DROP TRIGGER IF EXISTS b2b_dispatch_immutable ON b2b_dispatch;
CREATE TRIGGER b2b_dispatch_immutable BEFORE UPDATE OR DELETE ON b2b_dispatch
  FOR EACH ROW EXECUTE FUNCTION reject_b2b_evidence_mutation();
DROP TRIGGER IF EXISTS b2b_receipt_immutable ON b2b_receipt;
CREATE TRIGGER b2b_receipt_immutable BEFORE UPDATE OR DELETE ON b2b_receipt
  FOR EACH ROW EXECUTE FUNCTION reject_b2b_evidence_mutation();

COMMIT;
