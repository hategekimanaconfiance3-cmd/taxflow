import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

function sourceBlock(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `expected source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `expected end marker: ${endMarker}`);
  return source.slice(start, end);
}

test("B2B sales notify the buyer and keep seller stock reserved pending buyer confirmation", async () => {
  const source = await readFile(new URL("../lib/actions/transaction.action.ts", import.meta.url), "utf8");
  const create = sourceBlock(source, "async function createSaleForConfirmationInternal(", "type SaleCreationResult");

  assert.match(create, /status: 'pending'/);
  assert.match(create, /status: 'active'/);
  assert.match(create, /tx\.insert\(notification\)\.values\(\{\s*userId: buyer\.id, type: 'txn_incoming'/);
  assert.match(create, /link: '\/dashboard\/pending'/);
});

test("buyer confirmation remains authorized, idempotent, audited, and compatible with receipt-based stock credit", async () => {
  const source = await readFile(new URL("../lib/actions/transaction.action.ts", import.meta.url), "utf8");
  const confirm = sourceBlock(source, "export async function confirmTransaction(", "// Reject Transaction (Buyer rejects)");

  assert.match(confirm, /\.for\('update'\)/);
  assert.match(confirm, /session\.user\.id !== lockedTxn\.buyerId/);
  assert.match(confirm, /lockedTxn\.status !== 'pending'/);
  assert.match(confirm, /tx\.insert\(b2bOrderAcceptance\)/);
  assert.match(confirm, /tx\.insert\(vatRecord\)/);
  assert.match(confirm, /receiptRequiredForBuyerStockCredit: true/);
  assert.match(confirm, /stockCreditedToBuyer: 0/);
  assert.match(confirm, /action: 'TRANSACTION_CONFIRMED'/);
});

test("buyer decline releases the existing reservation once and records rejection evidence", async () => {
  const source = await readFile(new URL("../lib/actions/transaction.action.ts", import.meta.url), "utf8");
  const reject = sourceBlock(source, "export async function rejectTransaction(", "// Seller cancels a pending transaction");

  assert.match(reject, /lockedTxn\.buyerId !== session\.user\.id/);
  assert.match(reject, /lockedTxn\.status !== 'pending'/);
  assert.match(reject, /releaseStockReservation\(tx, lockedTxn, 'released'/);
  assert.match(reject, /set\(\{ status: 'rejected' \}\)/);
  assert.match(reject, /action: 'TRANSACTION_REJECTED'/);
  assert.match(reject, /userId: lockedTxn\.sellerId, type: 'txn_rejected'/);
});
