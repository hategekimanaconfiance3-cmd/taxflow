CREATE TABLE IF NOT EXISTS "stock_reservation" (
  "id" text PRIMARY KEY NOT NULL,
  "transaction_id" text NOT NULL UNIQUE REFERENCES "transaction"("id") ON DELETE CASCADE,
  "product_id" text NOT NULL REFERENCES "product"("id"),
  "quantity" real NOT NULL CHECK ("quantity" > 0),
  "seller_id" text NOT NULL REFERENCES "user"("id"),
  "buyer_id" text NOT NULL REFERENCES "user"("id"),
  "status" text NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'converted', 'released', 'expired', 'cancelled')),
  "reserved_at" timestamp NOT NULL DEFAULT now(),
  "expires_at" timestamp NOT NULL,
  "released_at" timestamp
);

CREATE INDEX IF NOT EXISTS "stock_reservation_seller_status_expires_idx"
  ON "stock_reservation" ("seller_id", "status", "expires_at");
CREATE INDEX IF NOT EXISTS "stock_reservation_buyer_status_expires_idx"
  ON "stock_reservation" ("buyer_id", "status", "expires_at");

-- Preserve any reservations created by the previous stock-movement marker implementation.
WITH inserted AS (
  INSERT INTO "stock_reservation" (
    "id", "transaction_id", "product_id", "quantity", "seller_id", "buyer_id", "status", "reserved_at", "expires_at"
  )
  SELECT gen_random_uuid()::text, t."id", t."product_id", t."quantity", t."seller_id", t."buyer_id",
         'active', m."created_at", m."created_at" + interval '10 minutes'
  FROM "transaction" t
  JOIN "stock_movement" m
    ON m."source_id" = t."id"
   AND m."source_type" = 'transaction_reservation'
   AND m."movement_type" = 'sale_reservation'
  WHERE t."status" = 'pending' AND t."buyer_id" IS NOT NULL
  ON CONFLICT ("transaction_id") DO NOTHING
  RETURNING "id", "transaction_id"
)
UPDATE "stock_movement" m
SET "source_type" = 'reservation', "source_id" = r."id"
FROM "stock_reservation" r
WHERE m."source_type" = 'transaction_reservation'
  AND m."movement_type" = 'sale_reservation'
  AND m."source_id" = r."transaction_id";