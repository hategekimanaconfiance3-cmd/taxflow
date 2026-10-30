import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
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

test('TaxFlow migration journal includes every SQL migration in timestamp order', async () => {
  const migrationDirectory = 'db/migrations/taxflow';
  const journal = JSON.parse(await readFile(`${migrationDirectory}/meta/_journal.json`, 'utf8')) as {
    entries: Array<{ tag: string; when: number }>;
  };
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((filename) => filename.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  assert.deepEqual(journal.entries.map((entry) => `${entry.tag}.sql`), migrationFiles);
  assert.equal(new Set(journal.entries.map((entry) => entry.tag)).size, journal.entries.length);
  assert.ok(journal.entries.every((entry, index) => index === 0 || journal.entries[index - 1]!.when < entry.when));
});

test('PostgreSQL manufacturing-material migration is repeatable, additive, and has protected ledger schema', {
  skip: canRun ? false : skipReason,
}, async () => {
  const client = postgres(databaseUrl!, { max: 1, onnotice: () => undefined });
  const rollbackToken = `material-accounting-rollback-${randomUUID()}`;
  try {
    const migration = await readFile('db/migrations/taxflow/0023_manufacturing_material_accounting.sql', 'utf8');
    const historyMigration = await readFile('db/migrations/taxflow/0024_production_history_comparisons.sql', 'utf8');
    const governanceMigration = await readFile('db/migrations/taxflow/0025_manufacturing_governance_accountability.sql', 'utf8');
    await assert.rejects(client.begin(async (tx) => {
      const before = await tx.unsafe<{ products: number; stock_rows: number; transactions: number }[]>(`SELECT
        (SELECT count(*)::int FROM public.product) AS products,
        (SELECT count(*)::int FROM public.stock) AS stock_rows,
        (SELECT count(*)::int FROM public."transaction") AS transactions`);

      await tx.unsafe(migration);
      await tx.unsafe(migration);
      await tx.unsafe(historyMigration);
      await tx.unsafe(historyMigration);
      await tx.unsafe(governanceMigration);
      await tx.unsafe(governanceMigration);

      const schemaRows = await tx.unsafe<{ precise_columns: number; protected_triggers: number; idempotency_indexes: number; workflow_constraints: number; foreign_keys: number; history_foreign_keys: number; history_indexes: number; material_tolerance_columns: number; material_tolerance_checks: number; governance_precise_columns: number; governance_triggers: number; governance_foreign_keys: number; governance_constraints: number }[]>(`SELECT
        (SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'production_material_movement' AND column_name IN ('quantity_delta', 'quantity_before', 'quantity_after') AND data_type = 'numeric' AND numeric_precision = 24 AND numeric_scale = 6) AS precise_columns,
        (SELECT count(*)::int FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('production_material_movement_immutable', 'production_material_plan_line_immutable', 'production_material_receipt_evidence_guard', 'production_material_receipt_no_delete', 'production_material_plan_evidence_guard', 'production_material_plan_no_delete', 'production_history_comparison_immutable', 'production_tolerance_standard_guard', 'production_tolerance_standard_no_delete', 'production_material_reservation_scope_guard', 'production_material_reservation_guard', 'production_material_usage_source_allocation_guard', 'production_material_usage_receipt_allocation_immutable')) AS protected_triggers,
        (SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('production_material_receipt_import_uniq', 'production_material_movement_receipt_uniq', 'production_material_movement_usage_uniq', 'prod_batch_material_plan_uniq')) AS idempotency_indexes,
        (SELECT count(*)::int FROM pg_constraint WHERE conname IN ('production_material_receipt_source_check', 'production_material_receipt_review_pair_check', 'production_material_movement_balance_check', 'production_material_movement_reference_check', 'production_batch_material_review_status_check', 'production_history_comparison_snapshot_object_check')) AS workflow_constraints,
        (SELECT count(*)::int FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name IN ('production_material_plan', 'production_material_plan_line', 'production_material_receipt', 'production_material_movement') AND constraint_type = 'FOREIGN KEY') AS foreign_keys,
        (SELECT count(*)::int FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'production_history_comparison' AND constraint_type = 'FOREIGN KEY') AS history_foreign_keys,
        (SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('production_history_comparison_batch_uniq', 'production_history_comparison_manufacturer_created_idx', 'production_history_comparison_product_created_idx')) AS history_indexes,
        (SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('production_recipe_material', 'production_batch_material_usage') AND column_name = 'consumption_tolerance_basis_points' AND data_type = 'integer') AS material_tolerance_columns,
        (SELECT count(*)::int FROM pg_constraint WHERE contype = 'c' AND conrelid IN ('public.production_recipe_material'::regclass, 'public.production_batch_material_usage'::regclass) AND pg_get_constraintdef(oid) LIKE '%consumption_tolerance_basis_points%') AS material_tolerance_checks,
        (SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'public' AND ((table_name = 'production_batch' AND column_name IN ('reported_good_output_quantity', 'reported_rejected_output_quantity', 'good_output_quantity', 'rejected_output_quantity')) OR (table_name = 'production_batch_material_usage' AND column_name = 'waste_quantity') OR (table_name = 'production_material_reservation' AND column_name IN ('reserved_quantity', 'consumed_quantity')) OR (table_name = 'production_material_usage_receipt_allocation' AND column_name = 'quantity')) AND data_type = 'numeric' AND numeric_precision = 24 AND numeric_scale = 6) AS governance_precise_columns,
        (SELECT count(*)::int FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('production_tolerance_standard_guard', 'production_tolerance_standard_no_delete', 'production_material_reservation_scope_guard', 'production_material_reservation_guard', 'production_material_usage_source_allocation_guard', 'production_material_usage_receipt_allocation_immutable')) AS governance_triggers,
        (SELECT count(*)::int FROM pg_constraint WHERE contype = 'f' AND conrelid IN ('public.production_tolerance_standard'::regclass, 'public.production_material_reservation'::regclass, 'public.production_material_usage_receipt_allocation'::regclass)) +
        (SELECT count(*)::int FROM pg_constraint WHERE contype = 'f' AND confrelid = 'public.production_tolerance_standard'::regclass AND conrelid IN ('public.production_batch'::regclass, 'public.production_batch_material_usage'::regclass)) AS governance_foreign_keys,
        (SELECT count(*)::int FROM pg_constraint WHERE conname IN ('production_tolerance_standard_scope_check', 'production_material_reservation_plan_line_uniq', 'production_material_usage_receipt_allocation_uniq', 'production_batch_output_pair_check', 'production_batch_reported_output_pair_check', 'production_batch_usage_waste_nonnegative_check')) AS governance_constraints`);
      const [schema] = schemaRows;

      assert.deepEqual(schema, {
        precise_columns: 3,
        protected_triggers: 13,
        idempotency_indexes: 4,
        workflow_constraints: 6,
        foreign_keys: 19,
        history_foreign_keys: 4,
        history_indexes: 3,
        material_tolerance_columns: 2,
        material_tolerance_checks: 2,
        governance_precise_columns: 8,
        governance_triggers: 6,
        governance_foreign_keys: 18,
        governance_constraints: 6,
      });
      const afterRows = await tx.unsafe<{ products: number; stock_rows: number; transactions: number }[]>(`SELECT
        (SELECT count(*)::int FROM public.product) AS products,
        (SELECT count(*)::int FROM public.stock) AS stock_rows,
        (SELECT count(*)::int FROM public."transaction") AS transactions`);
      const [after] = afterRows;
      assert.deepEqual(after, before[0]);
      const execute = (query: string, parameters: Array<string | number | null> = []) => tx.unsafe(query, parameters);

      const suffix = randomUUID();
      const manufacturerId = `phase3-manufacturer-${suffix}`;
      const superAdminUserId = `phase3-super-admin-${suffix}`;
      const ordinaryStaffUserId = `phase3-reviewer-${suffix}`;
      const productId = `phase3-product-${suffix}`;
      const recipeId = `phase3-recipe-${suffix}`;
      const materialId = `phase3-material-${suffix}`;
      const staffId = `phase3-staff-${suffix}`;
      await execute(`INSERT INTO public."user" (id, name, email, role) VALUES
        ($1, 'Phase 3 Manufacturer', $2, 'manufacturer'),
        ($3, 'Phase 3 Super Admin', $4, 'rra_staff'),
        ($5, 'Phase 3 Reviewer', $6, 'rra_staff')`, [manufacturerId, `m-${suffix}@example.test`, superAdminUserId, `s-${suffix}@example.test`, ordinaryStaffUserId, `r-${suffix}@example.test`]);
      await execute('INSERT INTO public.product (id, name, unit, created_by_user_id) VALUES ($1, $2, $3, $4)', [productId, 'Phase 3 Test Product', 'unit', manufacturerId]);
      await execute('INSERT INTO public.production_recipe (id, manufacturer_id, product_id, recipe_code, version, output_quantity, created_by_user_id) VALUES ($1, $2, $3, $4, $5, $6, $7)', [recipeId, manufacturerId, productId, `R-${suffix}`, 1, 10, manufacturerId]);
      await execute('INSERT INTO public.production_material (id, manufacturer_id, material_code, confidential_name, unit) VALUES ($1, $2, $3, $4, $5)', [materialId, manufacturerId, `M-${suffix}`, `Protected ${suffix}`, 'kg']);
      await execute('INSERT INTO public.production_recipe_material (id, recipe_version_id, material_id, quantity) VALUES ($1, $2, $3, $4)', [`line-${suffix}`, recipeId, materialId, 2]);
      await execute('INSERT INTO public.rra_staff (id, user_id, staff_id, clearance_level) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)', [`super-${suffix}`, superAdminUserId, `SA-${staffId}`, 'super_admin', `reviewer-${suffix}`, ordinaryStaffUserId, `ST-${staffId}`, 'stock_control_admin']);
      await execute('INSERT INTO public.rra_staff_role (id, staff_record_id, role) VALUES ($1, $2, $3), ($4, $5, $6)', [`role-super-${suffix}`, `super-${suffix}`, 'super_admin', `role-reviewer-${suffix}`, `reviewer-${suffix}`, 'stock_control_admin']);

      const standardId = `phase3-standard-${suffix}`;
      await execute(`INSERT INTO public.production_tolerance_standard
        (id, manufacturer_id, product_id, recipe_version_id, material_id, tolerance_type, version, tolerance_basis_points,
         tolerance_unit, effective_at, status, justification, evidence_reference, created_by_user_id)
        VALUES ($1, $2, $3, $4, $5, 'material_consumption', 1, 250,
         'basis_points', NOW(), 'draft', 'Reviewed against approved technical evidence.', $6, $7)`, [standardId, manufacturerId, productId, recipeId, materialId, `evidence-${suffix}`, superAdminUserId]);
      await execute(`UPDATE public.production_tolerance_standard SET status = 'approved', approved_by_user_id = $1, approved_at = NOW(), approval_note = 'Approval evidence reviewed.' WHERE id = $2`, [superAdminUserId, standardId]);
      await execute(`UPDATE public.production_tolerance_standard SET status = 'active', activated_by_user_id = $1, activated_at = NOW(), activation_note = 'Effective standard published.' WHERE id = $2`, [superAdminUserId, standardId]);
      await execute('SAVEPOINT unauthorized_tolerance_insert');
      await assert.rejects(execute(`INSERT INTO public.production_tolerance_standard
        (id, manufacturer_id, product_id, recipe_version_id, material_id, tolerance_type, version, tolerance_basis_points,
         tolerance_unit, effective_at, status, justification, evidence_reference, created_by_user_id)
        VALUES ($1, $2, $3, $4, NULL, 'yield', 1, 250,
         'basis_points', NOW(), 'draft', 'This insertion must be denied.', $5, $6)`, [`unauthorized-${suffix}`, manufacturerId, productId, recipeId, `evidence-unauthorized-${suffix}`, ordinaryStaffUserId]));
      await execute('ROLLBACK TO SAVEPOINT unauthorized_tolerance_insert');
      await execute('RELEASE SAVEPOINT unauthorized_tolerance_insert');
      await execute('SAVEPOINT immutable_tolerance_update');
      await assert.rejects(execute('UPDATE public.production_tolerance_standard SET tolerance_basis_points = 500 WHERE id = $1', [standardId]));
      await execute('ROLLBACK TO SAVEPOINT immutable_tolerance_update');
      await execute('RELEASE SAVEPOINT immutable_tolerance_update');
      await execute('SAVEPOINT immutable_tolerance_delete');
      await assert.rejects(execute('DELETE FROM public.production_tolerance_standard WHERE id = $1', [standardId]));
      await execute('ROLLBACK TO SAVEPOINT immutable_tolerance_delete');
      await execute('RELEASE SAVEPOINT immutable_tolerance_delete');
      const activeStandards = await tx.unsafe<{ id: string; status: string; tolerance_basis_points: number }[]>(
        'SELECT id, status, tolerance_basis_points FROM public.production_tolerance_standard WHERE id = $1', [standardId]);
      assert.equal(activeStandards.length, 1);
      assert.equal(activeStandards[0]?.id, standardId);
      assert.equal(activeStandards[0]?.status, 'active');
      assert.equal(activeStandards[0]?.tolerance_basis_points, 250);
      throw new Error(rollbackToken);
    }), new RegExp(rollbackToken));
  } finally {
    await client.end();
  }
});
