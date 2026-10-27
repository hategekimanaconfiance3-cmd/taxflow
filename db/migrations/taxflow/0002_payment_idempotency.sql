ALTER TABLE "tax_payment"
  ADD COLUMN "idempotency_key" text;

CREATE UNIQUE INDEX "tax_payment_business_idempotency_uniq"
  ON "tax_payment" ("business_id", "idempotency_key");
