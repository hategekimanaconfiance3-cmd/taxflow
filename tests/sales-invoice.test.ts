import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSalesInvoiceSnapshot, type SalesInvoiceSnapshot } from '../lib/sales-invoice-types';
import { renderSalesInvoicePdf } from '../lib/sales-invoice-pdf';

const snapshot: SalesInvoiceSnapshot = {
  schemaVersion: 1,
  invoiceNumber: 'INV-2026-00000001',
  issuedAt: '2026-10-31T10:00:00.000Z',
  currency: 'RWF',
  transaction: { id: 'txn-reference', status: 'confirmed', transactionType: 'B2B' },
  seller: { name: 'Seller Ltd', tin: '100000001' },
  buyer: { name: 'Buyer Ltd', tin: '100000002' },
  lines: [{
    description: 'Cement', quantity: 2, unit: 'bag', unitPriceRwf: 1000,
    subtotalRwf: 2000, vatRateBasisPoints: 1800, vatRwf: 360, totalRwf: 2360,
  }],
  subtotalRwf: 2000,
  recordedVatRwf: 360,
  totalRwf: 2360,
};

test('sales invoice snapshot accepts confirmed transaction amounts without recalculating them', () => {
  const parsed = parseSalesInvoiceSnapshot(snapshot);
  assert.equal(parsed.subtotalRwf, 2000);
  assert.equal(parsed.recordedVatRwf, 360);
  assert.equal(parsed.totalRwf, 2360);
  assert.equal(parsed.lines[0]?.unit, 'bag');
});

test('sales invoice snapshot rejects unsupported states and malformed monetary data', () => {
  assert.throws(() => parseSalesInvoiceSnapshot({
    ...snapshot,
    transaction: { ...snapshot.transaction, status: 'pending' },
  }));
  assert.throws(() => parseSalesInvoiceSnapshot({ ...snapshot, recordedVatRwf: '360' }));
});

test('PDF renderer emits a PDF document from the immutable invoice snapshot', () => {
  const pdf = renderSalesInvoicePdf(snapshot);
  assert.ok(pdf.byteLength > 500);
  assert.equal(Buffer.from(pdf).subarray(0, 4).toString('ascii'), '%PDF');
});
