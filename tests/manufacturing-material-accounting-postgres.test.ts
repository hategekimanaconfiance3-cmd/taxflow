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
    const finishedGoodsMigration = await readFile('db/migrations/taxflow/0032_production_finished_goods_lots.sql', 'utf8');
    const finishedGoodsLifecycleMigration = await readFile('db/migrations/taxflow/0033_finished_goods_lifecycle.sql', 'utf8');
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
      await tx.unsafe(finishedGoodsMigration);
      await tx.unsafe(finishedGoodsMigration);
      await tx.unsafe(finishedGoodsLifecycleMigration);
      await tx.unsafe(finishedGoodsLifecycleMigration);

      const schemaRows = await tx.unsafe<{ precise_columns: number; protected_triggers: number; idempotency_indexes: number; workflow_constraints: number; foreign_keys: number; history_foreign_keys: number; history_indexes: number; material_tolerance_columns: number; material_tolerance_checks: number; governance_precise_columns: number; governance_triggers: number; governance_foreign_keys: number; governance_constraints: number; finished_goods_columns: number; finished_goods_foreign_keys: number; finished_goods_indexes: number; finished_goods_triggers: number; finished_goods_constraints: number; lifecycle_precise_columns: number; lifecycle_foreign_keys: number; lifecycle_immutability_triggers: number; lifecycle_scope_triggers: number; lifecycle_idempotency_indexes: number; lifecycle_constraints: number; rejected_lot_indexes: number }[]>(`SELECT
        (SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'production_material_movement' AND column_name IN ('quantity_delta', 'quantity_before', 'quantity_after') AND data_type = 'numeric' AND numeric_precision = 24 AND numeric_scale = 6) AS precise_columns,
        (SELECT count(*)::int FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('production_material_movement_immutable', 'production_material_plan_line_immutable', 'production_material_receipt_evidence_guard', 'production_material_receipt_no_delete', 'production_material_plan_evidence_guard', 'production_material_plan_no_delete', 'production_history_comparison_immutable', 'production_tolerance_standard_guard', 'production_tolerance_standard_no_delete', 'production_material_reservation_scope_guard', 'production_material_reservation_guard', 'production_material_usage_source_allocation_guard', 'production_material_usage_receipt_allocation_immutable', 'production_finished_goods_lot_validate', 'production_finished_goods_lot_immutable', 'production_batch_require_finished_goods_lot')) AS protected_triggers,
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
        (SELECT count(*)::int FROM pg_constraint WHERE conname IN ('production_tolerance_standard_scope_check', 'production_material_reservation_plan_line_uniq', 'production_material_usage_receipt_allocation_uniq', 'production_batch_output_pair_check', 'production_batch_reported_output_pair_check', 'production_batch_usage_waste_nonnegative_check')) AS governance_constraints,
        (SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'production_finished_goods_lot' AND column_name = 'quantity' AND data_type = 'numeric' AND numeric_precision = 24 AND numeric_scale = 6) AS finished_goods_columns,
        (SELECT count(*)::int FROM pg_constraint WHERE contype = 'f' AND conrelid = 'public.production_finished_goods_lot'::regclass) AS finished_goods_foreign_keys,
        (SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('production_finished_goods_lot_batch_uniq', 'production_finished_goods_lot_movement_uniq', 'production_finished_goods_lot_manufacturer_ref_uniq', 'production_finished_goods_lot_product_created_idx')) AS finished_goods_indexes,
        (SELECT count(*)::int FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('production_finished_goods_lot_validate', 'production_finished_goods_lot_immutable', 'production_batch_require_finished_goods_lot')) AS finished_goods_triggers,
        (SELECT count(*)::int FROM pg_constraint WHERE conname IN ('production_finished_goods_lot_batch_uniq', 'production_finished_goods_lot_movement_uniq', 'production_finished_goods_lot_manufacturer_ref_uniq', 'production_finished_goods_lot_quantity_positive', 'production_finished_goods_lot_evidence_check')) AS finished_goods_constraints,
        (SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('production_finished_goods_movement', 'production_finished_goods_allocation', 'production_finished_goods_allocation_event', 'production_finished_goods_return', 'production_finished_goods_return_inspection', 'production_finished_goods_rework', 'production_rejected_goods_lot') AND column_name IN ('quantity_delta', 'quantity', 'accepted_quantity', 'rejected_quantity') AND data_type = 'numeric' AND numeric_precision = 24 AND numeric_scale = 6) AS lifecycle_precise_columns,
        (SELECT count(*)::int FROM pg_constraint WHERE contype = 'f' AND conrelid IN ('public.production_finished_goods_warehouse'::regclass, 'public.production_finished_goods_movement'::regclass, 'public.production_finished_goods_allocation'::regclass, 'public.production_finished_goods_allocation_event'::regclass, 'public.production_finished_goods_return'::regclass, 'public.production_finished_goods_return_inspection'::regclass, 'public.production_finished_goods_rework'::regclass, 'public.production_finished_goods_rework_decision'::regclass, 'public.production_rejected_goods_lot'::regclass)) AS lifecycle_foreign_keys,
        (SELECT count(*)::int FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('production_finished_goods_warehouse_immutable', 'production_finished_goods_movement_immutable', 'production_finished_goods_allocation_immutable', 'production_finished_goods_allocation_event_immutable', 'production_finished_goods_return_immutable', 'production_finished_goods_return_inspection_immutable', 'production_finished_goods_rework_immutable', 'production_finished_goods_rework_decision_immutable', 'production_rejected_goods_lot_immutable')) AS lifecycle_immutability_triggers,
        (SELECT count(*)::int FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('production_finished_goods_warehouse_scope_guard', 'production_finished_goods_movement_scope_guard', 'production_finished_goods_allocation_scope_guard', 'production_finished_goods_return_scope_guard', 'production_finished_goods_rework_scope_guard', 'production_rejected_goods_lot_scope_guard')) AS lifecycle_scope_triggers,
        (SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('production_fg_movement_manufacturer_key_uniq', 'production_fg_allocation_manufacturer_key_uniq', 'production_fg_return_manufacturer_key_uniq', 'production_fg_return_manufacturer_ref_uniq', 'production_fg_rework_manufacturer_key_uniq')) AS lifecycle_idempotency_indexes,
        (SELECT count(*)::int FROM pg_constraint WHERE conname IN ('production_fg_movement_type_check', 'production_fg_movement_delta_check', 'production_fg_movement_reason_evidence_check', 'production_fg_allocation_quantity_check', 'production_fg_allocation_event_type_check', 'production_fg_allocation_event_quantity_check', 'production_fg_return_quantity_check', 'production_fg_return_evidence_check', 'production_fg_return_inspection_decision_check', 'production_fg_return_inspection_quantities_check', 'production_fg_return_inspection_decision_quantity_check', 'production_fg_return_inspection_reason_check', 'production_fg_rework_quantity_check', 'production_fg_rework_evidence_check', 'production_fg_rework_decision_check', 'production_fg_rework_decision_reason_check', 'production_rejected_goods_lot_quantity_positive', 'production_rejected_goods_lot_evidence_check')) AS lifecycle_constraints,
        (SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('production_rejected_goods_lot_batch_uniq', 'production_rejected_goods_lot_manufacturer_ref_uniq', 'production_rejected_goods_lot_manufacturer_product_idx')) AS rejected_lot_indexes`);
      const [schema] = schemaRows;

      assert.deepEqual(schema, {
        precise_columns: 3,
        protected_triggers: 16,
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
        finished_goods_columns: 1,
        finished_goods_foreign_keys: 5,
        finished_goods_indexes: 4,
        finished_goods_triggers: 3,
        finished_goods_constraints: 5,
        lifecycle_precise_columns: 8,
        lifecycle_foreign_keys: 29,
        lifecycle_immutability_triggers: 9,
        lifecycle_scope_triggers: 6,
        lifecycle_idempotency_indexes: 5,
        lifecycle_constraints: 18,
        rejected_lot_indexes: 3,
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
      const batchId = `phase3-batch-${suffix}`;
      const batchReference = `B-${suffix}`;
      const stockMovementId = `phase3-stock-movement-${suffix}`;
      await execute(`INSERT INTO public.production_batch
        (id, manufacturer_id, product_id, batch_reference, declared_quantity, recipe_version_id,
         material_review_status, material_reviewed_by_id, material_reviewed_at, material_posted_at,
         good_output_quantity, rejected_output_quantity, status, period_start, period_end)
        VALUES ($1, $2, $3, $4, 3, $5, 'released', $6, NOW(), NOW(), 2.5, 0.5,
          'independently_supported', NOW(), NOW())`, [batchId, manufacturerId, productId, batchReference, recipeId, ordinaryStaffUserId]);
      await execute(`INSERT INTO public.stock_movement
        (id, business_id, product_id, quantity_delta, quantity_before, quantity_after,
         movement_type, source_type, source_id, actor_user_id, reason)
        VALUES ($1, $2, $3, 2.5, 0, 2.5, 'production', 'production_batch', $4, $5, 'Verified test output')`,
      [stockMovementId, manufacturerId, productId, batchId, ordinaryStaffUserId]);
      const priorFinishedGoodsLots = await tx.unsafe<{ count: number }[]>(
        'SELECT count(*)::int AS count FROM public.production_finished_goods_lot WHERE production_batch_id = $1', [batchId]);
      assert.equal(priorFinishedGoodsLots[0]?.count, 0, 'Migration must not fabricate historical finished-goods lots.');
      const finishedGoodsLotId = `phase3-finished-lot-${suffix}`;
      await execute(`INSERT INTO public.production_finished_goods_lot
        (id, manufacturer_id, product_id, production_batch_id, stock_movement_id, lot_reference,
         quantity, unit, evidence_reference, verified_by_user_id, verified_at)
        SELECT $1, $2, $3, $4, $5, $6, 2.5, 'unit', $7, $8, b.material_reviewed_at
        FROM public.production_batch AS b WHERE b.id = $4`,
      [finishedGoodsLotId, manufacturerId, productId, batchId, stockMovementId, batchReference, `output-evidence-${suffix}`, ordinaryStaffUserId]);
      await execute('SET CONSTRAINTS production_batch_require_finished_goods_lot IMMEDIATE');
      const rejectedLotId = `phase3-rejected-lot-${suffix}`;
      await execute(`INSERT INTO public.production_rejected_goods_lot
        (id, manufacturer_id, product_id, production_batch_id, lot_reference, quantity, unit,
         evidence_reference, verified_by_user_id, verified_at)
        SELECT $1, $2, $3, $4, $5, 0.5, 'unit', $6, b.material_reviewed_by_id, b.material_reviewed_at
        FROM public.production_batch AS b WHERE b.id = $4`,
      [rejectedLotId, manufacturerId, productId, batchId, `${batchReference}-REJ`, `rejected-evidence-${suffix}`]);
      await execute('SET CONSTRAINTS production_batch_require_rejected_goods_lot IMMEDIATE');
      await execute('SAVEPOINT immutable_rejected_lot');
      await assert.rejects(execute('UPDATE public.production_rejected_goods_lot SET quantity = 0.75 WHERE id = $1', [rejectedLotId]));
      await execute('ROLLBACK TO SAVEPOINT immutable_rejected_lot');
      await execute('RELEASE SAVEPOINT immutable_rejected_lot');
      const warehouseId = `phase3-warehouse-${suffix}`;
      await execute(`INSERT INTO public.production_finished_goods_warehouse
        (id, manufacturer_id, code, name, created_by_user_id) VALUES ($1, $2, $3, $4, $2)`,
      [warehouseId, manufacturerId, `W-${suffix}`, 'Test warehouse']);
      const destinationWarehouseId = `phase3-warehouse-destination-${suffix}`;
      await execute(`INSERT INTO public.production_finished_goods_warehouse
        (id, manufacturer_id, code, name, created_by_user_id) VALUES ($1, $2, $3, $4, $2)`,
      [destinationWarehouseId, manufacturerId, `WD-${suffix}`, 'Test destination']);
      const assignmentMovementId = `phase3-assignment-${suffix}`;
      await execute(`INSERT INTO public.production_finished_goods_movement
        (id, manufacturer_id, lot_id, warehouse_id, event_type, quantity_delta, source_type, source_id,
         idempotency_key, actor_user_id, reason)
        VALUES ($1, $2, $3, $4, 'warehouse_assignment', 2.5, 'warehouse_assignment', $3, $5, $2, 'Initial location')`,
      [assignmentMovementId, manufacturerId, finishedGoodsLotId, warehouseId, `assignment-${suffix}`]);
      const transferOutId = `phase3-transfer-out-${suffix}`;
      const transferInId = `phase3-transfer-in-${suffix}`;
      await execute(`INSERT INTO public.production_finished_goods_movement
        (id, manufacturer_id, lot_id, warehouse_id, event_type, quantity_delta, source_type, source_id,
         idempotency_key, actor_user_id, reason, evidence_reference)
        VALUES ($1, $2, $3, $4, 'transfer_out', -1, 'warehouse_transfer', $5, $6, $2, 'Verified warehouse transfer', 'transfer-document'),
               ($7, $2, $3, $8, 'transfer_in', 1, 'warehouse_transfer', $5, $9, $2, 'Verified warehouse transfer', 'transfer-document')`,
      [transferOutId, manufacturerId, finishedGoodsLotId, warehouseId, `transfer-${suffix}`, `transfer-out-${suffix}`, transferInId, destinationWarehouseId, `transfer-in-${suffix}`]);
      const transferBalance = await tx.unsafe<{ balance: string }[]>(`SELECT COALESCE(SUM(quantity_delta), 0)::text AS balance
        FROM public.production_finished_goods_movement WHERE lot_id = $1 AND event_type <> 'warehouse_assignment'`, [finishedGoodsLotId]);
      assert.equal(transferBalance[0]?.balance, '0.000000');
      await execute('SAVEPOINT immutable_lifecycle_movement');
      await assert.rejects(execute('DELETE FROM public.production_finished_goods_movement WHERE id = $1', [assignmentMovementId]));
      await execute('ROLLBACK TO SAVEPOINT immutable_lifecycle_movement');
      await execute('RELEASE SAVEPOINT immutable_lifecycle_movement');
      const pendingBatchId = `phase3-pending-batch-${suffix}`;
      await execute(`INSERT INTO public.production_batch
        (id, manufacturer_id, product_id, batch_reference, declared_quantity, recipe_version_id,
         material_review_status, status, period_start, period_end)
        VALUES ($1, $2, $3, $4, 1, $5, 'pending', 'held_material_review', NOW(), NOW())`,
      [pendingBatchId, manufacturerId, productId, `P-${suffix}`, recipeId]);
      await execute('SET CONSTRAINTS production_batch_require_finished_goods_lot DEFERRED');
      await execute('SAVEPOINT reject_release_without_lot');
      await execute(`UPDATE public.production_batch SET material_review_status = 'released',
        material_reviewed_by_id = $1, material_reviewed_at = NOW(), good_output_quantity = 1,
        rejected_output_quantity = 0 WHERE id = $2`, [ordinaryStaffUserId, pendingBatchId]);
      await assert.rejects(execute('SET CONSTRAINTS production_batch_require_finished_goods_lot IMMEDIATE'));
      await execute('ROLLBACK TO SAVEPOINT reject_release_without_lot');
      await execute('RELEASE SAVEPOINT reject_release_without_lot');
      await execute('SAVEPOINT invalid_finished_goods_quantity');
      await assert.rejects(execute(`INSERT INTO public.production_finished_goods_lot
        (id, manufacturer_id, product_id, production_batch_id, stock_movement_id, lot_reference,
         quantity, unit, evidence_reference, verified_by_user_id, verified_at)
        SELECT $1, $2, $3, $4, $5, $6, 2.4, 'unit', $7, $8, b.material_reviewed_at
        FROM public.production_batch AS b WHERE b.id = $4`,
      [`invalid-lot-${suffix}`, manufacturerId, productId, batchId, `invalid-movement-${suffix}`, batchReference, `output-evidence-${suffix}`, ordinaryStaffUserId]));
      await execute('ROLLBACK TO SAVEPOINT invalid_finished_goods_quantity');
      await execute('RELEASE SAVEPOINT invalid_finished_goods_quantity');
      await execute('SAVEPOINT immutable_finished_goods_lot');
      await assert.rejects(execute('UPDATE public.production_finished_goods_lot SET quantity = 3 WHERE id = $1', [finishedGoodsLotId]));
      await execute('ROLLBACK TO SAVEPOINT immutable_finished_goods_lot');
      await execute('RELEASE SAVEPOINT immutable_finished_goods_lot');
      await execute('SAVEPOINT delete_finished_goods_lot');
      await assert.rejects(execute('DELETE FROM public.production_finished_goods_lot WHERE id = $1', [finishedGoodsLotId]));
      await execute('ROLLBACK TO SAVEPOINT delete_finished_goods_lot');
      await execute('RELEASE SAVEPOINT delete_finished_goods_lot');
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
