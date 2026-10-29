"use server";

import { sql, eq, desc, gte } from "drizzle-orm";
import db from "@/db/drizzle";
import { transaction, stock, product, user } from "@/db/schema";
import { requireRRAPermission } from "@/lib/auth-guard";
import { computeAllRiskScores } from "@/lib/ai/risk-scoring";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnomalyType =
    | "high_quantity"
    | "duplicate_sale"
    | "exceeds_stock"
    | "high_value"
    | "high_risk_score";

export type Anomaly = {
    type: AnomalyType;
    severity: "warning" | "critical";
    transactionId: string;
    productName: string;
    sellerName: string;
    buyerName: string | null;
    quantity: number;
    totalAmount: number;
    date: Date;
    description: string;
};

// ---------------------------------------------------------------------------
// Detect anomalies across recent transactions
// ---------------------------------------------------------------------------

export async function detectAnomalies(): Promise<Anomaly[]> {
    await requireRRAPermission("transaction.read");

    const anomalies: Anomaly[] = [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get recent transactions with product/seller/buyer info
    const sellerSub = db
        .select({ id: user.id, businessName: user.businessName })
        .from(user)
        .as("seller");

    const buyerSub = db
        .select({ id: user.id, businessName: user.businessName })
        .from(user)
        .as("buyer");

    const recentTxns = await db
        .select({
            id: transaction.id,
            sellerId: transaction.sellerId,
            productId: transaction.productId,
            productName: product.name,
            sellerName: sql<string>`seller.business_name`,
            buyerName: sql<string | null>`COALESCE(buyer.business_name, ${transaction.buyerName})`,
            quantity: transaction.quantity,
            totalAmount: transaction.totalAmount,
            status: transaction.status,
            createdAt: transaction.createdAt,
        })
        .from(transaction)
        .innerJoin(product, eq(transaction.productId, product.id))
        .leftJoin(sellerSub, eq(transaction.sellerId, sql`seller.id`))
        .leftJoin(buyerSub, eq(transaction.buyerId, sql`buyer.id`))
        .where(gte(transaction.createdAt, thirtyDaysAgo))
        .orderBy(desc(transaction.createdAt));

    // ── 1. High Quantity: qty > 3× average for that product ────────────
    const avgByProduct = new Map<string, { avg: number; count: number; sum: number }>();
    for (const t of recentTxns) {
        const stat = avgByProduct.get(t.productId) ?? { avg: 0, count: 0, sum: 0 };
        stat.count += 1;
        stat.sum += t.quantity;
        stat.avg = stat.sum / stat.count;
        avgByProduct.set(t.productId, stat);
    }

    for (const t of recentTxns) {
        const stat = avgByProduct.get(t.productId);
        if (stat && stat.count >= 3 && t.quantity > stat.avg * 3) {
            anomalies.push({
                type: "high_quantity",
                severity: t.quantity > stat.avg * 5 ? "critical" : "warning",
                transactionId: t.id,
                productName: t.productName,
                sellerName: t.sellerName ?? "Unknown",
                buyerName: t.buyerName,
                quantity: t.quantity,
                totalAmount: t.totalAmount,
                date: t.createdAt,
                description: `Quantity ${t.quantity} is ${Math.round(t.quantity / stat.avg)}× the average (${Math.round(stat.avg)}).`,
            });
        }
    }

    // ── 2. High Value: amount > 3× average for that product ───────────
    const avgValueByProduct = new Map<string, { avg: number; count: number; sum: number }>();
    for (const t of recentTxns) {
        const stat = avgValueByProduct.get(t.productId) ?? { avg: 0, count: 0, sum: 0 };
        stat.count += 1;
        stat.sum += t.totalAmount;
        stat.avg = stat.sum / stat.count;
        avgValueByProduct.set(t.productId, stat);
    }

    for (const t of recentTxns) {
        const stat = avgValueByProduct.get(t.productId);
        if (stat && stat.count >= 3 && t.totalAmount > stat.avg * 3) {
            // Avoid duplicating if already flagged as high_quantity
            if (!anomalies.some((a) => a.transactionId === t.id)) {
                anomalies.push({
                    type: "high_value",
                    severity: t.totalAmount > stat.avg * 5 ? "critical" : "warning",
                    transactionId: t.id,
                    productName: t.productName,
                    sellerName: t.sellerName ?? "Unknown",
                    buyerName: t.buyerName,
                    quantity: t.quantity,
                    totalAmount: t.totalAmount,
                    date: t.createdAt,
                    description: `Amount is ${Math.round(t.totalAmount / stat.avg)}× the average.`,
                });
            }
        }
    }

    // ── 3. Duplicate Sales: same seller+product+quantity on same day ───
    const dayKey = (d: Date) =>
        `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

    const dailySales = new Map<string, typeof recentTxns>();
    for (const t of recentTxns) {
        const key = `${t.sellerId}:${t.productId}:${t.quantity}:${dayKey(t.createdAt)}`;
        const list = dailySales.get(key) ?? [];
        list.push(t);
        dailySales.set(key, list);
    }

    for (const [, txns] of dailySales) {
        if (txns.length >= 2) {
            for (const t of txns) {
                if (!anomalies.some((a) => a.transactionId === t.id)) {
                    anomalies.push({
                        type: "duplicate_sale",
                        severity: "warning",
                        transactionId: t.id,
                        productName: t.productName,
                        sellerName: t.sellerName ?? "Unknown",
                        buyerName: t.buyerName,
                        quantity: t.quantity,
                        totalAmount: t.totalAmount,
                        date: t.createdAt,
                        description: `${txns.length} identical sales (same seller, product, qty) on the same day.`,
                    });
                }
            }
        }
    }

    // ── 4. Exceeds Stock: seller's current stock is negative ──────────
    const stockLevels = await db
        .select({
            businessId: stock.businessId,
            productId: stock.productId,
            quantity: stock.quantity,
            productName: product.name,
            businessName: user.businessName,
            ownerName: user.name,
        })
        .from(stock)
        .innerJoin(product, eq(stock.productId, product.id))
        .innerJoin(user, eq(stock.businessId, user.id))
        .where(sql`${stock.quantity} < 0`);

    for (const s of stockLevels) {
        anomalies.push({
            type: "exceeds_stock",
            severity: "critical",
            transactionId: "",
            productName: s.productName,
            sellerName: s.businessName ?? s.ownerName,
            buyerName: null,
            quantity: s.quantity,
            totalAmount: 0,
            date: new Date(),
            description: `Negative stock (${s.quantity}) — sold more than available.`,
        });
    }

    // ── 5. AI Risk Scores: merchants with high/critical risk ──────────
    try {
        const riskScores = await computeAllRiskScores();
        const flaggedMerchants = riskScores.filter(
            (s) => s.level === "critical" || s.level === "high",
        );

        for (const rs of flaggedMerchants) {
            anomalies.push({
                type: "high_risk_score",
                severity: rs.level === "critical" ? "critical" : "warning",
                transactionId: "",
                productName: "",
                sellerName: rs.merchantName ?? "Unknown",
                buyerName: null,
                quantity: 0,
                totalAmount: 0,
                date: rs.computedAt,
                description: `AI risk score: ${rs.score}/100 (${rs.level}). Factors: ${rs.factors.map((f) => `${f.signal}: ${f.value}/100`).join(", ")}.`,
            });
        }
    } catch (error) {
        console.error("AI risk score computation in anomaly detection failed:", error);
    }

    // Sort: critical first, then by date
    anomalies.sort((a, b) => {
        if (a.severity !== b.severity)
            return a.severity === "critical" ? -1 : 1;
        return b.date.getTime() - a.date.getTime();
    });

    return anomalies;
}
