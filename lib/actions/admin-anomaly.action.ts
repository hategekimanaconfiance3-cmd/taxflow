"use server";

import { sql, eq, desc, gte } from "drizzle-orm";
import db from "@/db/drizzle";
import { transaction, stock, product, user } from "@/db/schema";
import { requireRRAPermission, requireRRASession } from "@/lib/auth-guard";
import { hasRRAPermission } from "@/lib/rra-rbac";

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

export type AnomalyPermissions = {
    canInvestigate: boolean;
    canAssign: boolean;
    canResolve: boolean;
    canEscalate: boolean;
    canReopen: boolean;
    visibleTypes: AnomalyType[];
};

// ---------------------------------------------------------------------------
// Internal detection logic (flag-gated â€” only runs what the role can see)
// ---------------------------------------------------------------------------

async function detectAnomaliesInternal(
    canReadTxn: boolean,
    canReadStock: boolean,
    canReadAI: boolean,
): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    if (canReadTxn) {
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

        // â”€â”€ 1. High Quantity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
                    description: `Quantity ${t.quantity} is ${Math.round(t.quantity / stat.avg)}Ã— the average (${Math.round(stat.avg)}).`,
                });
            }
        }

        // â”€â”€ 2. High Value â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
                        description: `Amount is ${Math.round(t.totalAmount / stat.avg)}Ã— the average.`,
                    });
                }
            }
        }

        // â”€â”€ 3. Duplicate Sales â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
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
    }

    if (canReadStock) {
        // â”€â”€ 4. Exceeds Stock â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
                description: `Negative stock (${s.quantity}) â€” sold more than available.`,
            });
        }
    }

    if (canReadAI) {
        // â”€â”€ 5. AI Risk Scores â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        try {
            const { computeAllRiskScores } = await import("@/lib/ai/risk-scoring");
            const riskScores = await Promise.race([
                computeAllRiskScores(),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error("Risk score timeout")), 7000)
                ),
            ]);
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
            const isTimeout = error instanceof Error && error.message === "Risk score timeout";
            console.error(
                isTimeout
                    ? "[anomaly-detection] AI risk score timed out â€” skipping risk signal"
                    : "AI risk score computation in anomaly detection failed:",
                isTimeout ? undefined : error,
            );
        }
    }

    // Sort: critical first, then by date
    anomalies.sort((a, b) => {
        if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
        return b.date.getTime() - a.date.getTime();
    });

    return anomalies;
}

// ---------------------------------------------------------------------------
// Public: detect all anomalies (original â€” used by existing tests)
// ---------------------------------------------------------------------------

export async function detectAnomalies(): Promise<Anomaly[]> {
    await requireRRAPermission("transaction.read");
    return detectAnomaliesInternal(true, true, true);
}

// ---------------------------------------------------------------------------
// Public: detect anomalies scoped to the current user's role permissions
// ---------------------------------------------------------------------------

export async function detectAnomaliesForRole(): Promise<{
    anomalies: Anomaly[];
    permissions: AnomalyPermissions;
}> {
    const session = await requireRRASession();
    const roles = session.staff.clearanceRoles;

    const canReadAll  = roles.some((r) => hasRRAPermission(r, "anomaly.read.all"));
    const canReadTxn  = canReadAll || roles.some((r) => hasRRAPermission(r, "anomaly.read.transaction"));
    const canReadStock = canReadAll || roles.some((r) => hasRRAPermission(r, "anomaly.read.stock"));
    const canReadAI   = canReadAll || roles.some((r) => hasRRAPermission(r, "anomaly.read.ai_risk"));

    const visibleTypes: AnomalyType[] = [
        ...(canReadTxn  ? (["high_quantity", "duplicate_sale", "high_value"] as AnomalyType[]) : []),
        ...(canReadStock ? (["exceeds_stock"] as AnomalyType[])                                : []),
        ...(canReadAI   ? (["high_risk_score"] as AnomalyType[])                               : []),
    ];

    const permissions: AnomalyPermissions = {
        canInvestigate: roles.some((r) => hasRRAPermission(r, "anomaly.investigate")),
        canAssign:      roles.some((r) => hasRRAPermission(r, "anomaly.assign")),
        canResolve:     roles.some((r) => hasRRAPermission(r, "anomaly.resolve")),
        canEscalate:    roles.some((r) => hasRRAPermission(r, "anomaly.escalate")),
        canReopen:      roles.some((r) => hasRRAPermission(r, "anomaly.reopen")),
        visibleTypes,
    };

    if (!canReadTxn && !canReadStock && !canReadAI) {
        return { anomalies: [], permissions };
    }

    const anomalies = await detectAnomaliesInternal(canReadTxn, canReadStock, canReadAI);
    return { anomalies, permissions };
}
