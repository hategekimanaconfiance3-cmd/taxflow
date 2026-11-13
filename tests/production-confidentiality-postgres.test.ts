import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import postgres from 'postgres';

const databaseUrl = process.env.TEST_DATABASE_URL;
const optedIn = process.env.PRODUCTION_FORMULA_TEST_DATABASE_DISPOSABLE === '1';
const safeTarget = Boolean(databaseUrl && databaseUrl !== process.env.DATABASE_URL && /(?:test|ci|disposable)/i.test(new URL(databaseUrl).pathname));
const canRun = Boolean(databaseUrl && optedIn && safeTarget);

test('PostgreSQL formula confidentiality migration is repeatable and protects recipe history', {
  skip: canRun ? false : 'Requires an explicitly opted-in disposable PostgreSQL database with the current TaxFlow schema migrated.',
}, async () => {
  const client = postgres(databaseUrl!, { max: 2 });
  try {
    const migration = await readFile('db/migrations/taxflow/0020_production_formula_confidentiality.sql', 'utf8');
    await client.begin(async (tx) => tx.unsafe(migration));
    await client.begin(async (tx) => tx.unsafe(migration));

    const tables = await client`
      SELECT to_regclass('public.production_material')::text AS materials,
        to_regclass('public.production_recipe')::text AS recipes,
        to_regclass('public.production_recipe_material')::text AS recipe_materials,
        to_regclass('public.production_batch_material_usage')::text AS batch_usage`;
    assert.ok(tables[0]?.materials);
    assert.ok(tables[0]?.recipes);
    assert.ok(tables[0]?.recipe_materials);
    assert.ok(tables[0]?.batch_usage);

    const triggers = await client`
      SELECT tgname AS name FROM pg_trigger
      WHERE NOT tgisinternal AND tgname IN (
        'production_material_immutable', 'production_recipe_immutable',
        'production_recipe_material_immutable', 'production_batch_material_usage_immutable',
        'production_batch_formula_evidence_immutable'
      )`;
    assert.equal(new Set(triggers.map((row) => row.name)).size, 5);

    const columns = await client`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'production_batch'
        AND column_name IN ('recipe_version_id', 'planned_output_quantity', 'production_validation_status', 'recipe_input_hash')`;
    assert.equal(columns.length, 4);
  } finally {
    await client.end();
  }
});
