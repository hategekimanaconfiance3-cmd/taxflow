import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { withActionDeadline } from '../lib/action-deadline';
import { createSaleTransactionId } from '../lib/transaction-idempotency';

test('action deadline returns a clear timeout and passes through completed results', async () => {
  assert.equal(await withActionDeadline(Promise.resolve('saved'), 100, 'timed out'), 'saved');
  await assert.rejects(
    withActionDeadline(new Promise<never>(() => {}), 10, 'validation timed out'),
    /validation timed out/,
  );
});

test('post-commit invoice and compliance work is scheduled outside sale responses', async () => {
  const source = await readFile(new URL('../lib/actions/transaction.action.ts', import.meta.url), 'utf8');
  const confirmStart = source.indexOf('export async function confirmTransaction(');
  const rejectStart = source.indexOf('// Reject Transaction (Buyer rejects)', confirmStart);
  const retailStart = source.indexOf('export async function createRetailSale(');
  const queryStart = source.indexOf('// Query transactions', retailStart);
  assert.ok(confirmStart >= 0 && rejectStart > confirmStart);
  assert.ok(retailStart >= 0 && queryStart > retailStart);

  const confirmation = source.slice(confirmStart, rejectStart);
  const retailSale = source.slice(retailStart, queryStart);
  assert.match(confirmation, /schedulePostTransactionWork\(/);
  assert.match(retailSale, /schedulePostTransactionWork\(/);
  assert.doesNotMatch(confirmation, /await\s+(?:attemptSalesInvoiceEmail|checkAndAlertCompliance)\(/);
  assert.doesNotMatch(retailSale, /await\s+(?:attemptSalesInvoiceEmail|checkAndAlertCompliance)\(/);
  assert.match(source, /after\(async \(\) =>/);
});

test('sale checks and transaction queries have bounded wait times', async () => {
  const source = await readFile(new URL('../lib/actions/transaction.action.ts', import.meta.url), 'utf8');
  const priceSource = await readFile(new URL('../lib/ai/price-suggestion.ts', import.meta.url), 'utf8');
  const emailSource = await readFile(new URL('../lib/sales-invoice-delivery.ts', import.meta.url), 'utf8');

  assert.match(source, /Sale validation took too long/);
  assert.match(source, /SET LOCAL statement_timeout = '30s'/);
  assert.match(priceSource, /getDistrictUserIds/);
  assert.match(emailSource, /AbortSignal\.timeout\(12_000\)/);
});

test('sale and buyer decision controls release their duplicate-submit guards in finally blocks', async () => {
  const files = [
    '../components/dashboard/sell-form/sell-form.tsx',
    '../components/dashboard/record-sale/record-sale-form.tsx',
    '../components/dashboard/pending-page/pending-page-client.tsx',
    '../components/dashboard/confirm-actions/confirm-actions.tsx',
  ];
  const sources = await Promise.all(files.map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  for (const source of sources) {
    assert.match(source, /useRef\(false\)/);
    assert.match(source, /finally\s*\{\s*(?:submissionInFlight|actionInFlight)\.current = false;/);
  }
});

test('sale transaction IDs are stable per actor, request key, and product line', () => {
  const key = 'a1160000-0000-4000-8000-000000000001';
  const id = createSaleTransactionId('seller-1', key, 'product-1');
  assert.equal(id, createSaleTransactionId('seller-1', key, 'product-1'));
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(id, createSaleTransactionId('seller-2', key, 'product-1'));
  assert.notEqual(id, createSaleTransactionId('seller-1', key, 'product-2'));
  assert.notEqual(id, createSaleTransactionId('seller-1', 'a1160000-0000-4000-8000-000000000002', 'product-1'));
});

test('both sale actions use stable transaction IDs and reload-persistent client request keys', async () => {
  const actionSource = await readFile(new URL('../lib/actions/transaction.action.ts', import.meta.url), 'utf8');
  const sellerSource = await readFile(new URL('../components/dashboard/sell-form/sell-form.tsx', import.meta.url), 'utf8');
  const retailSource = await readFile(new URL('../components/dashboard/record-sale/record-sale-form.tsx', import.meta.url), 'utf8');

  assert.match(actionSource, /id: createSaleTransactionId\(session\.user\.id, data\.submissionKey/);
  assert.match(actionSource, /findExistingRetailSale\(/);
  assert.match(sellerSource, /getClientSubmissionKey\(storageKey, JSON\.stringify\(submission\)\)/);
  assert.match(retailSource, /getClientSubmissionKey\(storageKey, JSON\.stringify\(submission\)\)/);
  assert.match(sellerSource, /clearClientSubmissionKey\(storageKey, submissionKey\)/);
  assert.match(retailSource, /clearClientSubmissionKey\(storageKey, submissionKey\)/);
});
