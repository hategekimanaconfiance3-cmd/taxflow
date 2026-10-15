import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildRiskAlerts } from "../lib/intelligence/risk-rules";

describe("buildRiskAlerts", () => {
  const now = new Date("2026-10-15T10:00:00.000Z");
  const baseTxn = {
    id: "txn-1",
    productId: "product-1",
    productName: "Rice",
    quantity: 2,
    unitPrice: 1000,
    totalAmount: 2000,
    vatAmount: 360,
    status: "completed",
    createdAt: new Date("2026-10-15T09:55:00.000Z"),
  };

  it("does not flag consistent transaction arithmetic or VAT", () => {
    const alerts = buildRiskAlerts({
      transactions: [baseTxn],
      stock: [{ id: "stock-1", productName: "Rice", quantity: 4 }],
      payments: [{ id: "payment-1", amount: 1000, status: "confirmed", createdAt: now }],
      vatRate: 0.18,
      now,
    });
    assert.equal(alerts.length, 0);
  });

  it("flags a stale pending transaction and inconsistent total", () => {
    const alerts = buildRiskAlerts({
      transactions: [{
        ...baseTxn,
        status: "pending",
        createdAt: new Date("2026-10-15T09:00:00.000Z"),
        totalAmount: 2500,
      }],
      stock: [],
      payments: [],
      vatRate: 0.18,
      now,
    });
    assert.ok(alerts.some((alert) => alert.code === "STALE_PENDING_TRANSACTION"));
    assert.ok(alerts.some((alert) => alert.code === "TRANSACTION_TOTAL_MISMATCH"));
  });

  it("flags stored VAT that differs from configured-rate arithmetic", () => {
    const alerts = buildRiskAlerts({
      transactions: [{ ...baseTxn, vatAmount: 100 }],
      stock: [],
      payments: [],
      vatRate: 0.18,
      now,
    });
    assert.ok(alerts.some((alert) => alert.code === "VAT_AMOUNT_MISMATCH"));
  });

  it("flags negative stock and unsettled payments", () => {
    const alerts = buildRiskAlerts({
      transactions: [],
      stock: [{ id: "stock-1", productName: "Rice", quantity: -1 }],
      payments: [{ id: "payment-1", amount: 500, status: "pending", createdAt: now }],
      vatRate: 0.18,
      now,
    });
    assert.ok(alerts.some((alert) => alert.code === "NEGATIVE_STOCK"));
    assert.ok(alerts.some((alert) => alert.code === "PAYMENT_NEEDS_REVIEW"));
  });

  it("flags unusual unit prices only with a five-record baseline", () => {
    const rows = [1000, 1050, 980, 1020, 10000].map((price, index) => ({
      ...baseTxn,
      id: `txn-${index}`,
      unitPrice: price,
      totalAmount: 2 * price,
      vatAmount: Math.round(2 * price * 0.18),
    }));
    const alerts = buildRiskAlerts({ transactions: rows, stock: [], payments: [], vatRate: 0.18, now });
    assert.ok(alerts.some((alert) => alert.code === "PRICE_DEVIATION"));
  });

  it("rejects invalid VAT configuration", () => {
    assert.throws(() => buildRiskAlerts({ transactions: [], stock: [], payments: [], vatRate: -0.1 }), RangeError);
  });
});
