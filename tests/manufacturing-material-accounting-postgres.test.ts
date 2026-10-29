import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import postgres from 'postgres';

const databaseUrl = process.env.TEST_DATABASE_URL;
const optedIn = process.env.PRODUCTION_MATERIAL_ACCOUNTING_TEST_DATABASE_DISPOSABLE === '1';
let safeTarget = false;
if (databaseUrl) {
  try {
    const databaseName = decodeURIComponent(new URL(databaseUrl).pathname);
    safeTarget = databaseUrl !== process.env.DATABASE_URL && /(?:test|ci|disposable)/i.test(databaseName);
  } catch {
    safeTarget = false;
  }
}
const canRun = Boolean(databaseUrl && optedIn && safeTarget);
const skipReason = 'Requires TEST_DATABASE_URL for a fully migrated disposable PostgreSQL database, database name containing test/ci/disposable, and PRODUCTION_MATERIAL_ACCOUNTING_TEST_DATABASE_DISPOSABLE=1.';

test('PostgreSQL manufacturing-material migration is repeatable, additive, and has protected ledger schema', {
  skip: canRun ? false : skipReason,
}, async () => {
  const client = postgres(databaseUrl!, { max: 1 });
  const rollbackToken = `material-accounting-rollback-${randomUUID()}`;
  try {
    const migration = await readFile('db/migrations/taxflow/0023_manufacturing_material_accounting.sql', 'utf8');
    await assert.rejects(client.begin(async (tx) => {
      const before = await tx.unsafe<{ products: number; stock_rows: number; transactions: number }[]>(`SELECT
        (SELECT count(*)::int FROM public.product) AS products,
        (SELECT count(*)::int FROM public.stock) AS stock_rows,
        (SELECT count(*)::int FROM public."transaction") AS transactions`);

      await tx.unsafe(migration);
      await tx.unsafe(migration);

      const schemaRows = await tx.unsafe<{ precise_columns: number; protected_triggers: number; idempotency_indexes: number; workflow_constraints: number; foreign_keys: number }[]>(`SELECT
        (SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'production_material_movement' AND column_name IN ('quantity_delta', 'quantity_before', 'quantity_after') AND data_type = 'numeric' AND numeric_precision = 24 AND numeric_scale = 6) AS precise_columns,
        (SELECT count(*)::int FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('production_material_movement_immutable', 'production_material_plan_line_immutable', 'production_material_receipt_evidence_guard', 'production_material_receipt_no_delete', 'production_material_plan_evidence_guard', 'production_material_plan_no_delete')) AS protected_triggers,
        (SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('production_material_receipt_import_uniq', 'production_material_movement_receipt_uniq', 'production_material_movement_usage_uniq', 'prod_batch_material_plan_uniq')) AS idempotency_indexes,
        (SELECT count(*)::int FROM pg_constraint WHERE conname IN ('production_material_receipt_source_check', 'production_material_receipt_review_pair_check', 'production_material_movement_balance_check', 'production_material_movement_reference_check', 'production_batch_material_review_status_check')) AS workflow_constraints,
        (SELECT count(*)::int FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name IN ('production_material_plan', 'production_material_plan_line', 'production_material_receipt', 'production_material_movement') AND constraint_type = 'FOREIGN KEY') AS foreign_keys`);
      const [schema] = schemaRows;

      assert.deepEqual(schema, {
        precise_columns: 3,
        protected_triggers: 6,
        idempotency_indexes: 4,
        workflow_constraints: 5,
        foreign_keys: 19,
      });
      const afterRows = await tx.unsafe<{ products: number; stock_rows: number; transactions: number }[]>(`SELECT
        (SELECT count(*)::int FROM public.product) AS products,
        (SELECT count(*)::int FROM public.stock) AS stock_rows,
        (SELECT count(*)::int FROM public."transaction") AS transactions`);
      const [after] = afterRows;
      assert.deepEqual(after, before[0]);
      throw new Error(rollbackToken);
    }), new RegExp(rollbackToken));
  } finally {
    await client.end();
  }
});
