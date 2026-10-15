"use server";

import { desc, eq, or, sql } from "drizzle-orm";
import db from "@/db/drizzle";
import { product, stock, taxPayment, transaction } from "@/db/schema";
import { requireTraderSession } from "@/lib/auth-guard";
import { getBusinessComplianceStatus } from "@/lib/compliance-status";
import { getSystemConfig } from "@/lib/actions/system-config.action";
import { buildRiskAlerts, type RiskAlert } from "@/lib/intelligence/risk-rules";

export interface IntelligenceDashboardData {
  generatedAt: string;
  summary: {
    totalAlerts: number;
    high: number;
    medium: number;
    low: number;
    pendingTransactions: number;
    pendingOrRejectedPayments: number;
  };
  compliance: {
    isCompliant: boolean;
    threshold: number;
    compliancePct: number;
    outstanding: number;
    netOwed: number;
    totalPaid: number;
  };
  alerts: RiskAlert[];
}

/**
 * Returns only the signed-in trader's records. The output is read-only and
 * contains review signals; it never changes transactions, payments, or tax rules.
 */
export async function getIntelligenceDashboard(): Promise<IntelligenceDashboardData> {
  const session = await requireTraderSession();
  const userId = session.user.id;

  const [config, compliance, transactionRows, stockRows, paymentRows] = await Promise.all([
    getSystemConfig(),
    getBusinessComplianceStatus(userId),
    db
      .select({
        id: transaction.id,
        productId: transaction.productId,
        productName: product.name,
        direction: sql<"sale" | "purchase">`CASE WHEN ${transaction.sellerId} = ${userId} THEN 'sale' ELSE 'purchase' END`,
        quantity: transaction.quantity,
        unitPrice: transaction.unitPrice,
        totalAmount: transaction.totalAmount,
        vatAmount: transaction.vatAmount,
        status: transaction.status,
        createdAt: transaction.createdAt,
      })
      .from(transaction)
      .innerJoin(product, eq(transaction.productId, product.id))
      .where(or(eq(transaction.sellerId, userId), eq(transaction.buyerId, userId)))
      .orderBy(desc(transaction.createdAt))
      .limit(250),
    db
      .select({
        id: stock.id,
        productName: product.name,
        quantity: stock.quantity,
      })
      .from(stock)
      .innerJoin(product, eq(stock.productId, product.id))
      .where(eq(stock.businessId, userId))
      .limit(250),
    db
      .select({
        id: taxPayment.id,
        amount: taxPayment.amount,
        status: taxPayment.status,
        createdAt: taxPayment.createdAt,
      })
      .from(taxPayment)
      .where(eq(taxPayment.businessId, userId))
      .orderBy(desc(taxPayment.createdAt))
      .limit(100),
  ]);

  const alerts = buildRiskAlerts({
    transactions: transactionRows,
    stock: stockRows,
    payments: paymentRows,
    vatRate: config.vatRate,
  });

  if (compliance.outstanding > 0 && !compliance.isCompliant) {
    alerts.push({
      id: "compliance:current",
      code: "PAYMENT_NEEDS_REVIEW",
      severity: "medium",
      title: "Tax compliance is below the configured threshold",
      message: `Recorded payments cover ${compliance.compliancePct}% of the calculated net amount owed. The configured threshold is ${compliance.threshold}%. Confirm the underlying liability and payment allocation before taking action.`,
      referenceId: "current-tax-position",
      observed: compliance.totalPaid,
      expected: compliance.netOwed,
    });
  }

  const rank = { high: 0, medium: 1, low: 2 } as const;
  alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalAlerts: alerts.length,
      high: alerts.filter((a) => a.severity === "high").length,
      medium: alerts.filter((a) => a.severity === "medium").length,
      low: alerts.filter((a) => a.severity === "low").length,
      pendingTransactions: transactionRows.filter((row) => row.status === "pending").length,
      pendingOrRejectedPayments: paymentRows.filter((row) => row.status === "pending" || row.status === "rejected").length,
    },
    compliance: {
      isCompliant: compliance.isCompliant,
      threshold: compliance.threshold,
      compliancePct: compliance.compliancePct,
      outstanding: compliance.outstanding,
      netOwed: compliance.netOwed,
      totalPaid: compliance.totalPaid,
    },
    alerts,
  };
}
