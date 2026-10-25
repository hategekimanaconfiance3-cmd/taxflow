import assert from "node:assert/strict";
import { test } from "node:test";
import { tickerRowsSchema } from "../lib/validation/admin-ticker.schema";

const validRow = {
  id: "transaction-1",
  businessName: "Example Traders Ltd",
  tinNumber: "100000001",
  totalAmount: 1180,
  vatAmount: 180,
  status: "confirmed",
  createdAt: "2026-10-24T12:00:00.000Z",
  items: [{
    id: "line-1",
    productName: "Recorded product",
    quantity: 1,
    unitPrice: 1000,
    totalPrice: 1000,
    vatAmount: 180,
  }],
};

test("transaction activity feed accepts the server's record shape", () => {
  assert.equal(tickerRowsSchema.safeParse([validRow]).success, true);
});

test("transaction activity feed rejects malformed rows and unexpected fields", () => {
  assert.equal(tickerRowsSchema.safeParse([{ ...validRow, totalAmount: "1180" }]).success, false);
  assert.equal(tickerRowsSchema.safeParse([{ ...validRow, internalNote: "restricted" }]).success, false);
  assert.equal(tickerRowsSchema.safeParse([{ ...validRow, items: [] }]).success, true);
});
