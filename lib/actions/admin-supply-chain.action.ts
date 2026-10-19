"use server";

import { eq, desc, sql } from "drizzle-orm";
import db from "@/db/drizzle";
import { transaction, product, user, stock } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SupplyChainNode = {
    businessId: string;
    businessName: string;
    role: string;
    totalSold: number;
    totalBought: number;
    currentStock: number;
};

export type SupplyChainLink = {
    from: string;
    to: string;
    toName: string;
    totalQuantity: number;
    totalValue: number;
    transactionCount: number;
};

export type ProductFlow = {
    product: {
        id: string;
        name: string;
        unit: string;
    };
    nodes: SupplyChainNode[];
    links: SupplyChainLink[];
};

// ---------------------------------------------------------------------------
// Get all products for the selector
// ---------------------------------------------------------------------------

export async function getProductList() {
    await requireRRASession("audit_officer", "stock_officer", "audit_investigation_officer", "product_traceability_officer");

    return db
        .select({
            id: product.id,
            name: product.name,
            unit: product.unit,
        })
        .from(product)
        .orderBy(product.name);
}

// ---------------------------------------------------------------------------
// Trace a product's flow through the supply chain
// ---------------------------------------------------------------------------

export async function getProductFlow(
    productId: string,
): Promise<ProductFlow | null> {
    await requireRRASession("audit_officer", "stock_officer", "audit_investigation_officer", "product_traceability_officer");

    // Get product info
    const [prod] = await db
        .select({ id: product.id, name: product.name, unit: product.unit })
        .from(product)
        .where(eq(product.id, productId))
        .limit(1);

    if (!prod) return null;

    // Get all confirmed/completed transactions for this product
    const txns = await db
        .select({
            sellerId: transaction.sellerId,
            buyerId: transaction.buyerId,
            buyerName: transaction.buyerName,
            quantity: transaction.quantity,
            totalAmount: transaction.totalAmount,
        })
        .from(transaction)
        .where(
            sql`${transaction.productId} = ${productId} AND ${transaction.status} IN ('confirmed', 'completed')`,
        );

    // Collect unique business IDs involved
    const businessIds = new Set<string>();
    for (const t of txns) {
        businessIds.add(t.sellerId);
        if (t.buyerId) businessIds.add(t.buyerId);
    }

    // Get business info
    const businesses =
        businessIds.size > 0
            ? await db
                .select({
                    id: user.id,
                    businessName: user.businessName,
                    name: user.name,
                    role: user.role,
                })
                .from(user)
                .where(
                    sql`${user.id} IN (${sql.join(
                        [...businessIds].map((id) => sql`${id}`),
                        sql`, `,
                    )})`,
                )
            : [];

    const bizMap = new Map(
        businesses.map((b) => [
            b.id,
            { name: b.businessName ?? b.name, role: b.role ?? "unknown" },
        ]),
    );

    // Get stock levels for this product
    const stockLevels = await db
        .select({
            businessId: stock.businessId,
            quantity: stock.quantity,
        })
        .from(stock)
        .where(eq(stock.productId, productId));

    const stockMap = new Map(
        stockLevels.map((s) => [s.businessId, s.quantity]),
    );

    // Build nodes (unique businesses)
    const nodeSold = new Map<string, number>();
    const nodeBought = new Map<string, number>();

    for (const t of txns) {
        nodeSold.set(t.sellerId, (nodeSold.get(t.sellerId) ?? 0) + t.quantity);
        if (t.buyerId) {
            nodeBought.set(
                t.buyerId,
                (nodeBought.get(t.buyerId) ?? 0) + t.quantity,
            );
        }
    }

    const nodes: SupplyChainNode[] = [...businessIds].map((id) => ({
        businessId: id,
        businessName: bizMap.get(id)?.name ?? "Unknown",
        role: bizMap.get(id)?.role ?? "unknown",
        totalSold: nodeSold.get(id) ?? 0,
        totalBought: nodeBought.get(id) ?? 0,
        currentStock: stockMap.get(id) ?? 0,
    }));

    // Sort nodes by supply chain position: manufacturer first, retailer last
    const roleOrder: Record<string, number> = {
        manufacturer: 0,
        wholesaler: 1,
        retailer: 2,
    };
    nodes.sort(
        (a, b) =>
            (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3),
    );

    // Build links (aggregated flows between pairs)
    const linkMap = new Map<
        string,
        { to: string; toName: string; quantity: number; value: number; count: number }
    >();

    for (const t of txns) {
        const target = t.buyerId ?? "consumer";
        const key = `${t.sellerId}→${target}`;
        const existing = linkMap.get(key);
        if (existing) {
            existing.quantity += t.quantity;
            existing.value += t.totalAmount;
            existing.count += 1;
        } else {
            linkMap.set(key, {
                to: target,
                toName:
                    target === "consumer"
                        ? t.buyerName ?? "Consumer"
                        : bizMap.get(target)?.name ?? "Unknown",
                quantity: t.quantity,
                value: t.totalAmount,
                count: 1,
            });
        }
    }

    const links: SupplyChainLink[] = [...linkMap.entries()].map(
        ([key, val]) => ({
            from: key.split("→")[0],
            to: val.to,
            toName: val.toName,
            totalQuantity: val.quantity,
            totalValue: val.value,
            transactionCount: val.count,
        }),
    );

    return { product: prod, nodes, links };
}
