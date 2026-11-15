import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("B2B stock backfill only credits confirmed acceptances without an existing receipt or credit", async () => {
  const migration = await readFile(new URL("../db/migrations/taxflow/0034_credit_confirmed_b2b_purchases.sql", import.meta.url), "utf8");
  const journal = await readFile(new URL("../db/migrations/taxflow/meta/_journal.json", import.meta.url), "utf8");

  assert.match(migration, /txn\.status IN \('confirmed', 'completed'\)/);
  assert.match(migration, /NOT EXISTS \([\s\S]*?SELECT 1 FROM b2b_receipt AS receipt/);
  assert.match(migration, /movement\.source_type = 'b2b_order_acceptance'/);
  assert.match(migration, /ON CONFLICT \(business_id, product_id\)/);
  assert.match(migration, /B2B_STOCK_CREDITED_ON_CONFIRMATION/);
  assert.match(journal, /0034_credit_confirmed_b2b_purchases/);
});
