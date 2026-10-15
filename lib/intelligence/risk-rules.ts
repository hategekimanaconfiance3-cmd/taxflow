/**
 * Pure, explainable rules for TaxFlow's risk/reconciliation dashboard.
 * Alerts are review signals, not findings of fraud or official tax assessments.
 */
export type RiskSeverity = "low" | "medium" | "high";
export type RiskAlertCode =
  | "STALE_PENDING_TRANSACTION"
  | "TRANSACTION_TOTAL_MISMATCH"
  | "VAT_AMOUNT_MISMATCH"
  | "NEGATIVE_STOCK"
  | "PAYMENT_NEEDS_REVIEW"
  | "PRICE_DEVIATION";

export interface RiskAlert {
  id: string;
  code: RiskAlertCode;
  severity: RiskSeverity;
  title: string;
  message: string;
  referenceId: string;
  observed?: number;
  expected?: number;
  createdAt?: string;
}

export interface TransactionObservation {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  vatAmount: number;
  status: string;
  createdAt: Date | string;
}

export interface StockObservation {
  id: string;
  productName: string;
  quantity: number;
}

export interface PaymentObservation {
  id: string;
  amount: number;
  status: string;
  createdAt: Date | string;
}

export interface RiskRuleInput {
  transactions: readonly TransactionObservation[];
  stock: readonly StockObservation[];
  payments: readonly PaymentObservation[];
  vatRate: number;
  now?: Date;
  stalePendingMinutes?: number;
  priceDeviationRatio?: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function buildRiskAlerts(input: RiskRuleInput): RiskAlert[] {
  if (!Number.isFinite(input.vatRate) || input.vatRate < 0 || input.vatRate > 10) {
    throw new RangeError("vatRate must be a finite fraction between 0 and 10");
  }

  const now = input.now ?? new Date();
  const staleMs = (input.stalePendingMinutes ?? 10) * 60_000;
  const priceRatio = input.priceDeviationRatio ?? 0.5;
  if (!Number.isFinite(staleMs) || staleMs < 0 || !Number.isFinite(priceRatio) || priceRatio < 0) {
    throw new RangeError("Risk rule thresholds must be non-negative finite numbers");
  }

  const alerts: RiskAlert[] = [];
  for (const txn of input.transactions) {
    const createdAt = new Date(txn.createdAt);
    if (txn.status === "pending" && now.getTime() - createdAt.getTime() > staleMs) {
      alerts.push({
        id: `pending:${txn.id}`,
        code: "STALE_PENDING_TRANSACTION",
        severity: "high",
        title: "Pending transaction needs confirmation",
        message: "This transaction has remained pending beyond the configured review window. Confirm dispatch and buyer receipt before relying on it for reconciliation.",
        referenceId: txn.id,
        createdAt: createdAt.toISOString(),
      });
    }

    const expectedTotal = Math.round(txn.quantity * txn.unitPrice);
    if (Number.isFinite(expectedTotal) && Math.abs(expectedTotal - txn.totalAmount) > 1) {
      alerts.push({
        id: `total:${txn.id}`,
        code: "TRANSACTION_TOTAL_MISMATCH",
        severity: "high",
        title: "Transaction total does not match its line values",
        message: "Recorded total differs from quantity multiplied by unit price. Review the original invoice and correction history.",
        referenceId: txn.id,
        observed: txn.totalAmount,
        expected: expectedTotal,
        createdAt: createdAt.toISOString(),
      });
    }

    const expectedVat = Math.round(txn.totalAmount * input.vatRate);
    if (Math.abs(expectedVat - txn.vatAmount) > 1) {
      alerts.push({
        id: `vat:${txn.id}`,
        code: "VAT_AMOUNT_MISMATCH",
        severity: "medium",
        title: "Stored VAT differs from configured calculation",
        message: "The stored VAT differs from the current configured-rate calculation. This may reflect a historical rate, exemption, or data issue; review the transaction's applicable tax-rule version before correcting anything.",
        referenceId: txn.id,
        observed: txn.vatAmount,
        expected: expectedVat,
        createdAt: createdAt.toISOString(),
      });
    }
  }

  for (const item of input.stock) {
    if (!Number.isFinite(item.quantity) || item.quantity < 0) {
      alerts.push({
        id: `stock:${item.id}`,
        code: "NEGATIVE_STOCK",
        severity: "high",
        title: "Inventory balance is invalid",
        message: "The recorded stock quantity is negative or not finite. Review referenced stock movements and record a reasoned adjustment; do not overwrite the audit trail.",
        referenceId: item.id,
        observed: item.quantity,
      });
    }
  }

  for (const payment of input.payments) {
    if (payment.status === "pending" || payment.status === "rejected") {
      alerts.push({
        id: `payment:${payment.id}`,
        code: "PAYMENT_NEEDS_REVIEW",
        severity: payment.status === "rejected" ? "medium" : "low",
        title: payment.status === "rejected" ? "Payment was rejected" : "Payment settlement is not confirmed",
        message: payment.status === "rejected"
          ? "Review the provider or bank reference and resolve the payment through the authorized payment workflow."
          : "Do not treat this payment as settled until independently verified evidence confirms it.",
        referenceId: payment.id,
        observed: payment.amount,
        createdAt: new Date(payment.createdAt).toISOString(),
      });
    }
  }

  const byProduct = new Map<string, TransactionObservation[]>();
  for (const txn of input.transactions) {
    if (txn.status !== "confirmed" && txn.status !== "completed") continue;
    const list = byProduct.get(txn.productId) ?? [];
    list.push(txn);
    byProduct.set(txn.productId, list);
  }

  for (const [productId, rows] of byProduct) {
    if (rows.length < 5) continue;
    const baseline = median(rows.map((row) => row.unitPrice));
    if (baseline <= 0) continue;
    for (const row of rows) {
      const deviation = Math.abs(row.unitPrice - baseline) / baseline;
      if (deviation <= priceRatio) continue;
      alerts.push({
        id: `price:${row.id}`,
        code: "PRICE_DEVIATION",
        severity: "medium",
        title: "Unit price differs from the recent product baseline",
        message: `Recorded unit price differs from the median of ${rows.length} confirmed/completed transactions for this product by ${(deviation * 100).toFixed(1)}%. This is a review signal only; product quality, location, timing, and tax treatment may explain the difference.`,
        referenceId: row.id,
        observed: row.unitPrice,
        expected: baseline,
        createdAt: new Date(row.createdAt).toISOString(),
      });
    }
    // Product ID is intentionally used only to group records; it is not exposed in the alert.
    void productId;
  }

  const severityRank: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2 };
  return alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}
