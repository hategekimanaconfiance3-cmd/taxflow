import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import postgres from 'postgres';

const databaseUrl = process.env.TEST_DATABASE_URL;
const disposableOptIn = process.env.B2B_TEST_DATABASE_DISPOSABLE === '1';
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
const skipReason = 'Requires a disposable, fully migrated PostgreSQL test database: TEST_DATABASE_URL, B2B_TEST_DATABASE_DISPOSABLE=1, and a database name containing test, ci, or disposable.';

test('PostgreSQL 0018 constraints, append-only evidence, and atomic rollback', {
  skip: canRunAgainstDisposableDb ? false : skipReason,
}, async () => {
  const client = postgres(databaseUrl!, { max: 1 });
  const sellerId = randomUUID();
  const buyerId = randomUUID();
  const productId = randomUUID();
  const transactionId = randomUUID();
  const acceptanceId = randomUUID();
  const dispatchId = randomUUID();
  const receiptId = randomUUID();
  const auditId = randomUUID();
  const actorId = buyerId;
  const rollbackToken = `b2b-test-rollback-${randomUUID()}`;

  try {
    const migration = await readFile('db/migrations/taxflow/0018_b2b_dispatch_receipt_foundation.sql', 'utf8');
    await client.unsafe(migration);
    await client.unsafe(migration);

    const [tables] = await client`SELECT
      to_regclass('public.business_representative')::text AS representative_table,
      to_regclass('public.b2b_order_acceptance')::text AS acceptance_table,
      to_regclass('public.b2b_dispatch')::text AS dispatch_table,
      to_regclass('public.b2b_receipt')::text AS receipt_table`;
    assert.ok(tables?.representative_table);
    assert.ok(tables?.acceptance_table);
    assert.ok(tables?.dispatch_table);
    assert.ok(tables?.receipt_table);

    await assert.rejects(client.begin(async (tx) => {
      const dispatchKey = randomUUID();
      const receiptKey = randomUUID();
      await tx.unsafe('INSERT INTO public."user" (id, name, email, tin_number, business_name, email_verified, clearance_status) VALUES ($1, $2, $3, $4, $5, TRUE, $6)', [sellerId, 'Phase 3B.2A test seller', `${sellerId}@example.test`, `S${sellerId.slice(0, 8)}`, 'Test Seller', 'approved']);
      await tx.unsafe('INSERT INTO public."user" (id, name, email, tin_number, business_name, email_verified, clearance_status) VALUES ($1, $2, $3, $4, $5, TRUE, $6)', [buyerId, 'Phase 3B.2A test buyer', `${buyerId}@example.test`, `B${buyerId.slice(0, 8)}`, 'Test Buyer', 'approved']);
      await tx.unsafe('INSERT INTO public.product (id, name, unit, created_by_user_id) VALUES ($1, $2, $3, $4)', [productId, 'Phase 3B.2A test product', 'unit', sellerId]);
      await tx.unsafe('INSERT INTO public."transaction" (id, seller_id, buyer_id, product_id, quantity, unit_price, total_amount, vat_amount, status) VALUES ($1, $2, $3, $4, 10, 100, 1000, 180, $5)', [transactionId, sellerId, buyerId, productId, 'confirmed']);
      await tx.unsafe('INSERT INTO public.b2b_order_acceptance (id, transaction_id, buyer_business_id, actor_user_id) VALUES ($1, $2, $3, $4)', [acceptanceId, transactionId, buyerId, buyerId]);
      await tx.unsafe('INSERT INTO public.b2b_dispatch (id, transaction_id, seller_business_id, actor_user_id, quantity, idempotency_key) VALUES ($1, $2, $3, $4, 10, $5)', [dispatchId, transactionId, sellerId, sellerId, dispatchKey]);
      await tx.unsafe('INSERT INTO public.b2b_receipt (id, dispatch_id, transaction_id, buyer_business_id, actor_user_id, quantity_received, accepted_quantity, damaged_quantity, rejected_quantity, disputed_quantity, idempotency_key) VALUES ($1, $2, $3, $4, $5, 8, 5, 1, 1, 1, $6)', [receiptId, dispatchId, transactionId, buyerId, actorId, receiptKey]);
      await tx.unsafe('INSERT INTO public.stock (id, business_id, product_id, quantity) VALUES ($1, $2, $3, 90), ($4, $5, $6, 5)', [randomUUID(), sellerId, productId, randomUUID(), buyerId, productId]);
      await tx.unsafe('INSERT INTO public.stock_movement (id, business_id, product_id, quantity_delta, quantity_before, quantity_after, movement_type, source_type, source_id, actor_user_id) VALUES ($1, $2, $3, 5, 0, 5, $4, $5, $6, $7)', [randomUUID(), buyerId, productId, 'b2b_receipt_accepted', 'b2b_receipt', receiptId, buyerId]);

      await assert.rejects(tx.savepoint(async (savepoint) => {
        await savepoint.unsafe('UPDATE public.b2b_receipt SET accepted_quantity = 6 WHERE id = $1', [receiptId]);
      }));
      await assert.rejects(tx.savepoint(async (savepoint) => {
        await savepoint.unsafe('DELETE FROM public.b2b_dispatch WHERE id = $1', [dispatchId]);
      }));
      await assert.rejects(tx.savepoint(async (savepoint) => {
        await savepoint.unsafe('INSERT INTO public.b2b_receipt (id, dispatch_id, transaction_id, buyer_business_id, actor_user_id, quantity_received, accepted_quantity, damaged_quantity, rejected_quantity, disputed_quantity, idempotency_key) VALUES ($1, $2, $3, $4, $5, 2, 1, 0, 0, 0, $6)', [randomUUID(), dispatchId, transactionId, buyerId, actorId, randomUUID()]);
      }));
      await assert.rejects(tx.savepoint(async (savepoint) => {
        await savepoint.unsafe('INSERT INTO public.b2b_dispatch (id, transaction_id, seller_business_id, actor_user_id, quantity, idempotency_key) VALUES ($1, $2, $3, $4, 1, $5)', [randomUUID(), transactionId, sellerId, sellerId, dispatchKey]);
      }));
      await assert.rejects(tx.savepoint(async (savepoint) => {
        await savepoint.unsafe('INSERT INTO public.b2b_order_acceptance (id, transaction_id, buyer_business_id, actor_user_id) VALUES ($1, $2, $3, $4)', [randomUUID(), transactionId, buyerId, buyerId]);
      }));

      await tx.unsafe('INSERT INTO public.audit_log (id, user_id, action, target_type, target_id) VALUES ($1, $2, $3, $4, $5)', [auditId, buyerId, 'B2B_RECEIPT_RECORDED_TEST', 'b2b_receipt', receiptId]);
      throw new Error(rollbackToken);
    }), new RegExp(rollbackToken));

    const [persisted] = await client`SELECT
      (SELECT count(*)::int FROM public."user" WHERE id IN (${sellerId}, ${buyerId})) AS users,
      (SELECT count(*)::int FROM public.b2b_order_acceptance WHERE id = ${acceptanceId}) AS acceptances,
      (SELECT count(*)::int FROM public.b2b_dispatch WHERE id = ${dispatchId}) AS dispatches,
      (SELECT count(*)::int FROM public.b2b_receipt WHERE id = ${receiptId}) AS receipts,
      (SELECT count(*)::int FROM public.stock WHERE business_id IN (${sellerId}, ${buyerId}) AND product_id = ${productId}) AS stocks,
      (SELECT count(*)::int FROM public.stock_movement WHERE source_type = 'b2b_receipt' AND source_id = ${receiptId}) AS movements,
      (SELECT count(*)::int FROM public.audit_log WHERE id = ${auditId}) AS audits`;
    assert.deepEqual(persisted, { users: 0, acceptances: 0, dispatches: 0, receipts: 0, stocks: 0, movements: 0, audits: 0 });
  } finally {
    await client.end();
  }
});
