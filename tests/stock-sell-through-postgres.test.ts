import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import postgres from "postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;
const disposableOptIn = process.env.STOCK_CONTROL_TEST_DATABASE_DISPOSABLE === "1";
const notProductionUrl = Boolean(databaseUrl && databaseUrl !== process.env.DATABASE_URL);
let disposableDatabaseName = false;
if (databaseUrl) {
  try {
    disposableDatabaseName = /(?:test|ci|disposable)/i.test(decodeURIComponent(new URL(databaseUrl).pathname));
  } catch {
    disposableDatabaseName = false;
  }
}
const canRunAgainstDisposableDb = Boolean(databaseUrl && disposableOptIn && notProductionUrl && disposableDatabaseName);
const skipReason = "Requires an explicitly opted-in disposable PostgreSQL database with TaxFlow migrations 0001–0018 already applied.";

test("PostgreSQL 0019 schema, immutable policy history, idempotency, and transaction rollback", {
  skip: canRunAgainstDisposableDb ? false : skipReason,
}, async () => {
  const client = postgres(databaseUrl!, { max: 4 });
  const actorId = randomUUID();
  const productId = randomUUID();
  const cycleId = randomUUID();
  const thresholdId = randomUUID();
  const rollbackRequestId = randomUUID();
  const rollbackKey = `rollback-${randomUUID()}`;
  const businessKey = `concurrent-${randomUUID()}`;
  const rollbackToken = `stock-control-rollback-${randomUUID()}`;

  const insertRequest = async (id: string, idempotencyKey: string) => client`
    INSERT INTO public.stock_restock_request (
      id, business_id, product_id, requested_quantity, requested_by_user_id,
      idempotency_key, cycle_id, cycle_started_at, threshold_id, threshold_percent,
      baseline_quantity, cohort_quantity, qualifying_sales_quantity, required_sales_quantity,
      sell_through_percent, eligibility_status, eligibility_reason, source_evidence_refs
    ) VALUES (
      ${id}, ${actorId}, ${productId}, 3, ${actorId}, ${idempotencyKey}, ${cycleId}, NOW(),
      ${thresholdId}, 75, 10, 10, 8, 7.5, 80, 'eligible', 'Test eligibility result', '{}'
    ) RETURNING id`;

  try {
    const migration = await readFile("db/migrations/taxflow/0019_stock_sell_through_requests.sql", "utf8");
    // Drizzle wraps each journaled migration in a transaction. Exercise the
    // same behavior here so a mid-migration failure cannot leave partial DDL.
    await client.begin(async (tx) => tx.unsafe(migration));
    await client.begin(async (tx) => tx.unsafe(migration));

    const requiredConstraints = [
      "stock_sell_through_threshold_scope_check",
      "stock_sell_through_threshold_key_check",
      "stock_sell_through_threshold_percent_check",
      "stock_sell_through_cycle_baseline_check",
      "stock_sell_through_cycle_status_check",
      "stock_restock_request_quantity_check",
      "stock_restock_request_owner_check",
      "stock_restock_request_quantities_check",
      "stock_restock_request_eligibility_check",
      "stock_restock_request_exception_check",
      "stock_restock_request_threshold_check",
      "stock_restock_request_sell_through_check",
      "stock_restock_request_exception_reason_check",
      "stock_restock_request_review_pair_check",
    ];
    const constraints = await client`
      SELECT conname AS name
      FROM pg_constraint
      WHERE conrelid IN (
        'public.stock_sell_through_threshold'::regclass,
        'public.stock_sell_through_cycle'::regclass,
        'public.stock_restock_request'::regclass
      )`;
    const constraintNames = new Set(constraints.map((constraint) => constraint.name));
    for (const name of requiredConstraints) assert.ok(constraintNames.has(name), `missing constraint ${name}`);

    const requiredIndexes = [
      "stock_sell_through_threshold_scope_effective_idx",
      "stock_sell_through_cycle_business_product_uniq",
      "stock_sell_through_cycle_business_idx",
      "stock_restock_request_business_idempotency_uniq",
      "stock_restock_request_status_created_idx",
      "stock_restock_request_exception_created_idx",
      "stock_restock_request_business_product_created_idx",
    ];
    const indexes = await client`
      SELECT indexname AS name
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('stock_sell_through_threshold', 'stock_sell_through_cycle', 'stock_restock_request')`;
    const indexNames = new Set(indexes.map((index) => index.name));
    for (const name of requiredIndexes) assert.ok(indexNames.has(name), `missing index ${name}`);

    const [trigger] = await client`
      SELECT tgname AS name
      FROM pg_trigger
      WHERE tgrelid = 'public.stock_sell_through_threshold'::regclass
        AND tgname = 'stock_sell_through_threshold_immutable'
        AND NOT tgisinternal`;
    assert.equal(trigger?.name, "stock_sell_through_threshold_immutable");
    const [mutationFunction] = await client`
      SELECT to_regprocedure('public.reject_stock_sell_through_threshold_mutation()')::text AS name`;
    assert.ok(mutationFunction?.name);

    await client`INSERT INTO public."user" (id, name, email) VALUES (${actorId}, 'Stock Control Test Owner', ${`${actorId}@example.test`})`;
    await client`INSERT INTO public.product (id, name, unit, created_by_user_id) VALUES (${productId}, 'Stock Control Test Product', 'unit', ${actorId})`;
    await client`
      INSERT INTO public.stock_sell_through_threshold (id, scope_type, scope_key, threshold_percent, effective_at, reason, created_by_user_id)
      VALUES (${thresholdId}, 'product', ${productId}, 75, NOW(), 'PostgreSQL validation test', ${actorId})`;
    await client`
      INSERT INTO public.stock_sell_through_cycle (id, business_id, product_id, baseline_quantity, cycle_started_at, baseline_status)
      VALUES (${cycleId}, ${actorId}, ${productId}, 10, NOW(), 'ledger_verified')`;

    const [tables] = await client`SELECT
      to_regclass('public.stock_sell_through_threshold')::text AS threshold_table,
      to_regclass('public.stock_sell_through_cycle')::text AS cycle_table,
      to_regclass('public.stock_restock_request')::text AS request_table`;
    assert.ok(tables?.threshold_table);
    assert.ok(tables?.cycle_table);
    assert.ok(tables?.request_table);

    await assert.rejects(client`
      INSERT INTO public.stock_sell_through_threshold (id, scope_type, scope_key, threshold_percent, effective_at, reason, created_by_user_id)
      VALUES (${randomUUID()}, 'product', ${productId}, 100.1, NOW(), 'Out of range', ${actorId})`);
    await assert.rejects(client`UPDATE public.stock_sell_through_threshold SET threshold_percent = 10 WHERE id = ${thresholdId}`);
    await assert.rejects(client`DELETE FROM public.stock_sell_through_threshold WHERE id = ${thresholdId}`);

    await assert.rejects(client.begin(async (tx) => {
      await tx.unsafe(`
        INSERT INTO public.stock_restock_request (
          id, business_id, product_id, requested_quantity, requested_by_user_id,
          idempotency_key, cycle_id, cycle_started_at, threshold_id, threshold_percent,
          baseline_quantity, cohort_quantity, qualifying_sales_quantity, required_sales_quantity,
          eligibility_status, eligibility_reason, source_evidence_refs
        ) VALUES ($1, $2, $3, 3, $2, $4, $5, NOW(), $6, 75, 10, 10, 8, 7.5, 'eligible', 'Rollback request', '{}')`,
      [rollbackRequestId, actorId, productId, rollbackKey, cycleId, thresholdId]);
      throw new Error(rollbackToken);
    }), new RegExp(rollbackToken));
    const [rolledBack] = await client`SELECT count(*)::int AS count FROM public.stock_restock_request WHERE id = ${rollbackRequestId}`;
    assert.equal(rolledBack?.count, 0);

    const concurrent = await Promise.allSettled([
      insertRequest(randomUUID(), businessKey),
      insertRequest(randomUUID(), businessKey),
    ]);
    assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(concurrent.filter((result) => result.status === "rejected").length, 1);
  } finally {
    await client.end();
  }
});
