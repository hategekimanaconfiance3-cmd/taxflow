// Server-only — RRA Intelligence Agent Tools

import { tool } from "ai";
import { z } from "zod";
import { eq, sql, desc, and, or, gte, lte, ilike, inArray } from "drizzle-orm";
import db from "@/db/drizzle";
import {
    user, transaction, stock, stockMovement, product, vatRecord,
    taxPayment, importDeclaration, dispute,
} from "@/db/schema";
import tinDb from "@/db/tin-drizzle";
import { tinRecord } from "@/db/tin-schema";
import { computeRiskScore } from "@/lib/ai/risk-scoring";
import { presentRiskAssessmentForAI } from "@/lib/ai/risk-assessment-presentation";
import { getRevenueForecast } from "@/lib/ai/revenue-forecast";
import { analyzeMerchantBehavior } from "@/lib/ai/behavioral-analysis";
import { searchProductJourney } from "@/lib/actions/product-journey.action";
import { getTaxpayerIntelligenceForAI } from "@/lib/actions/admin-tin-lookup.action";
import { getProductionHistoryAnalysis } from "@/lib/ai/production-history-service";

// ---------------------------------------------------------------------------
// AI Tools — Database query tools for the RRA Intelligence Agent.
// Each tool gives the LLM read-only access to one domain of data.
// ---------------------------------------------------------------------------

/** Search a TIN and return only the modules permitted for the signed-in RRA employee. */
export const getTaxpayerIntelligence = tool({
    description: "Get an authorized, role-filtered taxpayer summary by TIN. Use for questions asking what is known about a taxpayer, a taxpayer summary, recent activity, compliance, stock, production, or related records. The server verifies the employee's session and permissions before querying; only authorized modules are returned. Never infer data from missing modules.",
    inputSchema: z.object({
        tin: z.string().trim().min(5).max(32).describe("Taxpayer TIN"),
    }),
    execute: async ({ tin }) => getTaxpayerIntelligenceForAI({ tin }),
});

/** Find a trader directory record. Use the filtered intelligence tool for detail. */
export const lookupTrader = tool({
    description: "Find a registered trader by TIN, business name, or email and return only basic directory fields plus district. For a taxpayer summary or any compliance, stock, production, transaction, or history question, prefer getTaxpayerIntelligence, which enforces module permissions before retrieval.",
    inputSchema: z.object({
        query: z.string().describe("TIN number, business name, or email to search for"),
    }),
    execute: async ({ query }) => {
        const q = `%${query}%`;
        const traders = await db
            .select({
                name: user.name,
                businessName: user.businessName,
                tinNumber: user.tinNumber,
                role: user.role,
                clearanceStatus: user.clearanceStatus,
                createdAt: user.createdAt,
            })
            .from(user)
            .where(
                sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')
                AND (${ilike(user.tinNumber, q)} OR ${ilike(user.businessName, q)} OR ${ilike(user.email, q)} OR ${ilike(user.name, q)})`,
            )
            .limit(5);

        if (traders.length === 0) return { found: false, message: "No traders found matching the query." };

        // Enrich with district
        const enriched = await Promise.all(
            traders.map(async (t) => {
                let district: string | null = null;
                if (t.tinNumber) {
                    const [tin] = await tinDb
                        .select({ district: tinRecord.district, province: tinRecord.province })
                        .from(tinRecord)
                        .where(eq(tinRecord.tinNumber, t.tinNumber))
                        .limit(1);
                    district = tin ? `${tin.district}, ${tin.province}` : null;
                }
                return { ...t, district };
            }),
        );

        return { found: true, count: enriched.length, traders: enriched };
    },
});

/** Search the entire registered trader directory, across all business tiers. */
export const searchTraders = tool({
    description: "Search or list registered manufacturers, wholesalers, and retailers in the TaxFlow database. Use this for RRA-wide trader discovery. Filters are optional; without a search term it lists traders by recent registration. Returns at most 50 rows per page.",
    inputSchema: z.object({
        query: z.string().trim().max(100).optional().describe("Optional TIN, business name, or trader name search"),
        role: z.enum(["manufacturer", "wholesaler", "retailer"]).optional(),
        clearanceStatus: z.enum(["pending", "approved", "under_review", "suspended"]).optional(),
        limit: z.number().int().min(1).max(50).default(25),
        offset: z.number().int().min(0).max(5000).default(0),
    }),
    execute: async ({ query, role, clearanceStatus, limit, offset }) => {
        const conditions = [sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`];
        if (role) conditions.push(eq(user.role, role));
        if (clearanceStatus) conditions.push(eq(user.clearanceStatus, clearanceStatus));
        const normalizedQuery = query?.trim();
        if (normalizedQuery) {
            const pattern = `%${normalizedQuery}%`;
            conditions.push(or(
                ilike(user.tinNumber, pattern),
                ilike(user.businessName, pattern),
                ilike(user.name, pattern),
            )!);
        }

        const traders = await db
            .select({
                name: user.name,
                businessName: user.businessName,
                tinNumber: user.tinNumber,
                role: user.role,
                clearanceStatus: user.clearanceStatus,
                createdAt: user.createdAt,
            })
            .from(user)
            .where(and(...conditions))
            .orderBy(desc(user.createdAt))
            .limit(limit)
            .offset(offset);

        return { count: traders.length, offset, limit, traders };
    },
});

/** Get transaction history for a trader or product. */
export const getTransactions = tool({
    description: "Get recent transactions. Filter by trader TIN (matches buyer or seller), seller TIN, product name, or status. Returns up to 50 transactions.",
    inputSchema: z.object({
        traderTin: z.string().trim().min(1).max(32).optional().describe("Filter to transactions where this registered trader is buyer or seller"),
        sellerTin: z.string().optional().describe("Filter by seller TIN number"),
        productName: z.string().optional().describe("Filter by product name"),
        status: z.enum(["pending", "confirmed", "completed", "rejected", "expired"]).optional(),
        from: z.iso.datetime().optional().describe("Inclusive start date/time in ISO 8601 format"),
        to: z.iso.datetime().optional().describe("Inclusive end date/time in ISO 8601 format"),
        limit: z.number().min(1).max(50).default(20),
    }),
    execute: async ({ traderTin, sellerTin, productName, status, from, to, limit }) => {
        const conditions = [];

        if (from && to && new Date(from).getTime() > new Date(to).getTime()) {
            return { count: 0, transactions: [], summary: { totalValue: 0, totalVat: 0 }, message: "The start date must be before the end date." };
        }

        if (traderTin) {
            const [trader] = await db
                .select({ id: user.id })
                .from(user)
                .where(and(
                    eq(user.tinNumber, traderTin),
                    sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
                ))
                .limit(1);
            if (!trader) return { count: 0, transactions: [], summary: { totalValue: 0, totalVat: 0 }, message: "No registered trader found with that TIN." };
            conditions.push(or(eq(transaction.sellerId, trader.id), eq(transaction.buyerId, trader.id))!);
        }

        if (sellerTin) {
            const [seller] = await db
                .select({ id: user.id })
                .from(user)
                .where(and(
                    eq(user.tinNumber, sellerTin),
                    sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
                ))
                .limit(1);
            if (!seller) return { count: 0, transactions: [], summary: { totalValue: 0, totalVat: 0 }, message: "No registered seller found with that TIN." };
            conditions.push(eq(transaction.sellerId, seller.id));
        }

        if (status) conditions.push(eq(transaction.status, status));
        if (from) conditions.push(gte(transaction.createdAt, new Date(from)));
        if (to) conditions.push(lte(transaction.createdAt, new Date(to)));

        const query = db
            .select({
                id: transaction.id,
                productName: product.name,
                sellerName: user.businessName,
                buyerName: transaction.buyerName,
                quantity: transaction.quantity,
                unitPrice: transaction.unitPrice,
                totalAmount: transaction.totalAmount,
                vatAmount: transaction.vatAmount,
                status: transaction.status,
                createdAt: transaction.createdAt,
            })
            .from(transaction)
            .innerJoin(product, eq(transaction.productId, product.id))
            .innerJoin(user, eq(transaction.sellerId, user.id));

        if (productName) {
            conditions.push(ilike(product.name, `%${productName}%`));
        }

        const txns = await (conditions.length > 0
            ? query.where(and(...conditions))
            : query
        )
            .orderBy(desc(transaction.createdAt))
            .limit(limit);

        return {
            count: txns.length,
            period: { from: from ?? null, to: to ?? null },
            transactions: txns,
            summary: {
                totalValue: txns.reduce((s, t) => s + t.totalAmount, 0),
                totalVat: txns.reduce((s, t) => s + t.vatAmount, 0),
            },
        };
    },
});

/** Get stock levels for a trader. */
export const getStockLevels = tool({
    description: "Get current stock/inventory levels for a trader by TIN number. Shows all products they hold.",
    inputSchema: z.object({
        traderTin: z.string().describe("Trader TIN number"),
    }),
    execute: async ({ traderTin }) => {
        const [trader] = await db
            .select({ id: user.id, businessName: user.businessName })
            .from(user)
            .where(and(eq(user.tinNumber, traderTin), sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`))
            .limit(1);

        if (!trader) return { found: false, message: "Trader not found" };

        const inventory = await db
            .select({
                productName: product.name,
                productUnit: product.unit,
                quantity: stock.quantity,
                price: stock.price,
                source: stock.source,
                lastUpdated: stock.updatedAt,
            })
            .from(stock)
            .innerJoin(product, eq(stock.productId, product.id))
            .where(eq(stock.businessId, trader.id));

        return {
            trader: trader.businessName,
            tin: traderTin,
            itemCount: inventory.length,
            inventory,
            totalStockValue: inventory.reduce((s, i) => s + (i.quantity * (i.price ?? 0)), 0),
        };
    },
});

/** Explain inventory changes using append-only stock movement evidence. */
export const getStockMovements = tool({
    description: "Get recorded inventory movements for a taxpayer by TIN, optionally filtered by product name. Use to explain when and how stock changed. A movement reason is only recorded evidence; do not invent a cause when it is missing.",
    inputSchema: z.object({
        traderTin: z.string().trim().min(5).max(32),
        productName: z.string().trim().min(1).max(100).optional(),
        limit: z.number().int().min(1).max(100).default(30),
    }),
    execute: async ({ traderTin, productName, limit }) => {
        const [trader] = await db.select({ id: user.id, businessName: user.businessName })
            .from(user)
            .where(and(eq(user.tinNumber, traderTin), sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`))
            .limit(1);
        if (!trader) return { found: false, message: "No registered trader was found with that TIN." };

        const conditions = [eq(stockMovement.businessId, trader.id)];
        if (productName) conditions.push(ilike(product.name, `%${productName}%`));
        const movements = await db.select({
            productName: product.name,
            movementType: stockMovement.movementType,
            quantityDelta: stockMovement.quantityDelta,
            quantityBefore: stockMovement.quantityBefore,
            quantityAfter: stockMovement.quantityAfter,
            sourceType: stockMovement.sourceType,
            reason: stockMovement.reason,
            createdAt: stockMovement.createdAt,
        }).from(stockMovement)
            .innerJoin(product, eq(stockMovement.productId, product.id))
            .where(and(...conditions))
            .orderBy(desc(stockMovement.createdAt))
            .limit(limit);
        return { found: true, businessName: trader.businessName, tin: traderTin, count: movements.length, movements };
    },
});

/** Get tax status for a trader. */
export const getTaxStatus = tool({
    description: "Get tax compliance status for a trader — VAT owed, paid, and outstanding balance.",
    inputSchema: z.object({
        traderTin: z.string().describe("Trader TIN number"),
    }),
    execute: async ({ traderTin }) => {
        const [trader] = await db
            .select({ id: user.id, businessName: user.businessName })
            .from(user)
            .where(and(eq(user.tinNumber, traderTin), sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`))
            .limit(1);

        if (!trader) return { found: false, message: "Trader not found" };

        const [vatOutput] = await db
            .select({ total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8` })
            .from(vatRecord)
            .where(and(eq(vatRecord.businessId, trader.id), eq(vatRecord.vatType, "output")));

        const [vatInput] = await db
            .select({ total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8` })
            .from(vatRecord)
            .where(and(eq(vatRecord.businessId, trader.id), eq(vatRecord.vatType, "input")));

        const [paid] = await db
            .select({ total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8` })
            .from(taxPayment)
            .where(and(eq(taxPayment.businessId, trader.id), eq(taxPayment.status, "confirmed")));

        const owed = (vatOutput?.total ?? 0) - (vatInput?.total ?? 0);
        const paidAmount = paid?.total ?? 0;

        return {
            trader: trader.businessName,
            tin: traderTin,
            vatOutput: vatOutput?.total ?? 0,
            vatInput: vatInput?.total ?? 0,
            netVatOwed: owed,
            totalPaid: paidAmount,
            outstanding: owed - paidAmount,
            compliancePercentage: owed > 0 ? Math.round((paidAmount / owed) * 100) : 100,
        };
    },
});

/** Get AI risk score for a trader. */
export const getRiskAssessment = tool({
    description: "Get TaxFlow's existing system-generated risk signal for a trader. This is an uncalibrated review indicator, never proof of fraud or an official finding. The tool withholds the composite score if any component is unavailable or has insufficient data, and lists the component signals and limitations.",
    inputSchema: z.object({
        traderTin: z.string().describe("Trader TIN number"),
    }),
    execute: async ({ traderTin }) => {
        const [trader] = await db
            .select({ id: user.id })
            .from(user)
            .where(and(eq(user.tinNumber, traderTin), sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`))
            .limit(1);

        if (!trader) return { found: false, message: "Trader not found" };

        const assessment = await computeRiskScore(trader.id);
        return presentRiskAssessmentForAI(assessment);
    },
});

/** Get revenue forecast data. */
export const getRevenueForecastTool = tool({
    description: "Get AI revenue forecast — expected vs actual tax revenue over the last N months, with gap analysis and trend.",
    inputSchema: z.object({
        months: z.number().min(1).max(12).default(6).describe("Number of months to analyze"),
    }),
    execute: async ({ months }) => {
        const forecast = await getRevenueForecast(months);
        return forecast;
    },
});

/** Get system-wide statistics — matches the admin dashboard cards exactly. */
export const getSystemStats = tool({
    description: "Get the complete admin dashboard overview — traders by role, total taxes generated (VAT output), total VAT collected (payments), net tax due, transaction stats by status, imports, disputes, and today's activity. These numbers match the admin dashboard cards exactly. Use this as the PRIMARY tool for any question about system-wide stats, revenue, or national totals.",
    inputSchema: z.object({}),
    execute: async () => {
        // Run the SAME queries as admin-dashboard.action.ts getDashboardOverview()
        const [
            tradersByRole,
            totalTraders,
            transactionStats,
            transactionsToday,
            transactionsThisWeek,
            vatStats,
            taxPaymentStats,
            importStats,
            disputeStats,
            newTradersThisWeek,
        ] = await Promise.all([
            // Traders by role
            db.select({ role: user.role, count: sql<number>`COUNT(*)` })
                .from(user)
                .where(sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`)
                .groupBy(user.role),

            // Total traders
            db.select({ count: sql<number>`COUNT(*)` })
                .from(user)
                .where(sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`),

            // Transaction stats by status
            db.select({
                status: transaction.status,
                count: sql<number>`COUNT(*)`,
                totalValue: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`,
                totalVat: sql<number>`COALESCE(SUM(${transaction.vatAmount}), 0)::float8`,
            }).from(transaction).groupBy(transaction.status),

            // Transactions today
            db.select({
                count: sql<number>`COUNT(*)`,
                totalValue: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`,
            }).from(transaction).where(sql`${transaction.createdAt} >= CURRENT_DATE`),

            // Transactions this week
            db.select({
                count: sql<number>`COUNT(*)`,
                totalValue: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`,
            }).from(transaction).where(sql`${transaction.createdAt} >= CURRENT_DATE - INTERVAL '7 days'`),

            // VAT stats from vatRecord table (NOT transaction.vatAmount)
            db.select({
                vatType: vatRecord.vatType,
                total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`,
            }).from(vatRecord).groupBy(vatRecord.vatType),

            // Tax payments
            db.select({
                total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`,
                count: sql<number>`COUNT(*)`,
            }).from(taxPayment).where(eq(taxPayment.status, "confirmed")),

            // Imports by status
            db.select({
                status: importDeclaration.status,
                count: sql<number>`COUNT(*)`,
            }).from(importDeclaration).groupBy(importDeclaration.status),

            // Disputes by status
            db.select({
                status: dispute.status,
                count: sql<number>`COUNT(*)`,
            }).from(dispute).groupBy(dispute.status),

            // New traders this week
            db.select({ count: sql<number>`COUNT(*)` })
                .from(user)
                .where(and(
                    sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
                    sql`${user.createdAt} >= CURRENT_DATE - INTERVAL '7 days'`,
                )),
        ]);

        // Parse results
        const vatOutput = vatStats.find((r) => r.vatType === "output")?.total ?? 0;
        const vatInput = vatStats.find((r) => r.vatType === "input")?.total ?? 0;

        const roleMap = Object.fromEntries(tradersByRole.map((r) => [r.role, r.count]));
        const totalTxnCount = transactionStats.reduce((s, r) => s + r.count, 0);
        const totalTxnValue = transactionStats.reduce((s, r) => s + r.totalValue, 0);
        const confirmedTxns = transactionStats.find((s) => s.status === "confirmed");
        const pendingTxns = transactionStats.find((s) => s.status === "pending");
        const totalImports = importStats.reduce((s, r) => s + r.count, 0);
        const totalDisputes = disputeStats.reduce((s, r) => s + r.count, 0);

        return {
            traders: {
                total: totalTraders[0]?.count ?? 0,
                manufacturers: roleMap["manufacturer"] ?? 0,
                wholesalers: roleMap["wholesaler"] ?? 0,
                retailers: roleMap["retailer"] ?? 0,
                newThisWeek: newTradersThisWeek[0]?.count ?? 0,
            },
            revenue: {
                totalTaxesGenerated_vatOutput: vatOutput,
                totalVatCollected_payments: taxPaymentStats[0]?.total ?? 0,
                vatInput,
                netVatDue: vatOutput - vatInput,
                outstanding: (vatOutput - vatInput) - (taxPaymentStats[0]?.total ?? 0),
                taxPaymentsCount: taxPaymentStats[0]?.count ?? 0,
            },
            transactions: {
                total: totalTxnCount,
                totalValue: totalTxnValue,
                confirmed: confirmedTxns?.count ?? 0,
                pending: pendingTxns?.count ?? 0,
                today: {
                    count: transactionsToday[0]?.count ?? 0,
                    value: transactionsToday[0]?.totalValue ?? 0,
                },
                thisWeek: {
                    count: transactionsThisWeek[0]?.count ?? 0,
                    value: transactionsThisWeek[0]?.totalValue ?? 0,
                },
            },
            imports: {
                total: totalImports,
                byStatus: Object.fromEntries(importStats.map((s) => [s.status, s.count])),
            },
            disputes: {
                total: totalDisputes,
                byStatus: Object.fromEntries(disputeStats.map((s) => [s.status, s.count])),
            },
            note: "These numbers match the RRA Command Center dashboard exactly. 'totalTaxesGenerated' = system-wide output VAT from the vatRecord table. 'totalVatCollected' = confirmed tax payments received.",
        };
    },
});

/** Get behavioral analysis for a trader. */
export const getBehavioralAnalysis = tool({
    description: "Get AI behavioral analysis for a trader — underreporting patterns, volume spikes, price consistency, and risk trend over the last 90 days.",
    inputSchema: z.object({
        traderTin: z.string().describe("Trader TIN number"),
    }),
    execute: async ({ traderTin }) => {
        const [trader] = await db
            .select({ id: user.id })
            .from(user)
            .where(and(eq(user.tinNumber, traderTin), sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`))
            .limit(1);

        if (!trader) return { found: false, message: "Trader not found" };

        const profile = await analyzeMerchantBehavior(trader.id);
        return profile;
    },
});

/** Trace a product's supply chain movement. */
export const traceSupplyChain = tool({
    description: "Trace the supply chain for a product — shows movement from Manufacturer → Wholesaler → Retailer → Consumer with prices at each step. Search by product name.",
    inputSchema: z.object({
        productName: z.string().describe("Product name to trace"),
        limit: z.number().min(1).max(10).default(5).describe("Number of chains to trace"),
    }),
    execute: async ({ productName, limit }) => {
        // Find the product
        const products = await db
            .select({ id: product.id, name: product.name })
            .from(product)
            .where(ilike(product.name, `%${productName}%`))
            .limit(1);

        if (products.length === 0) return { found: false, message: "Product not found" };

        const prod = products[0];

        // Get all confirmed transactions for this product, ordered by date
        const txns = await db
            .select({
                id: transaction.id,
                sellerId: transaction.sellerId,
                buyerId: transaction.buyerId,
                buyerName: transaction.buyerName,
                quantity: transaction.quantity,
                unitPrice: transaction.unitPrice,
                totalAmount: transaction.totalAmount,
                status: transaction.status,
                createdAt: transaction.createdAt,
            })
            .from(transaction)
            .where(
                and(
                    eq(transaction.productId, prod.id),
                    inArray(transaction.status, ["confirmed", "completed"]),
                ),
            )
            .orderBy(desc(transaction.createdAt))
            .limit(50);

        if (txns.length === 0) return { found: true, product: prod.name, chains: [], message: "No confirmed transactions found" };

        // Get all involved user info
        const userIds = [...new Set(txns.flatMap((t) => [t.sellerId, t.buyerId].filter(Boolean)))];
        const users = await db
            .select({
                id: user.id,
                businessName: user.businessName,
                role: user.role,
                tinNumber: user.tinNumber,
            })
            .from(user)
            .where(sql`${user.id} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`);

        const userMap = new Map(users.map((u) => [u.id, u]));

        // Build chains: find manufacturer sales and trace forward
        const chains = [];
        const manufacturerSales = txns.filter((t) => {
            const seller = userMap.get(t.sellerId);
            return seller?.role === "manufacturer";
        });

        for (const mfgSale of manufacturerSales.slice(0, limit)) {
            const chain = [];
            const seller = userMap.get(mfgSale.sellerId);
            const buyer = userMap.get(mfgSale.buyerId ?? "");

            chain.push({
                step: 1,
                from: { name: seller?.businessName, role: seller?.role, tin: seller?.tinNumber },
                to: buyer ? { name: buyer.businessName, role: buyer.role, tin: buyer.tinNumber } : { name: mfgSale.buyerName, role: "consumer" },
                unitPrice: mfgSale.unitPrice,
                quantity: mfgSale.quantity,
                date: mfgSale.createdAt,
            });

            // Trace forward: find where buyer resold
            if (buyer) {
                const resales = txns.filter(
                    (t) =>
                        t.sellerId === buyer.id &&
                        t.createdAt &&
                        mfgSale.createdAt &&
                        t.createdAt >= mfgSale.createdAt,
                );
                for (const resale of resales.slice(0, 1)) {
                    const nextBuyer = userMap.get(resale.buyerId ?? "");
                    chain.push({
                        step: 2,
                        from: { name: buyer.businessName, role: buyer.role, tin: buyer.tinNumber },
                        to: nextBuyer ? { name: nextBuyer.businessName, role: nextBuyer.role, tin: nextBuyer.tinNumber } : { name: resale.buyerName, role: "consumer" },
                        unitPrice: resale.unitPrice,
                        priceChange: `${resale.unitPrice > mfgSale.unitPrice ? "+" : ""}${resale.unitPrice - mfgSale.unitPrice} RWF (${Math.round(((resale.unitPrice - mfgSale.unitPrice) / mfgSale.unitPrice) * 100)}%)`,
                        quantity: resale.quantity,
                        date: resale.createdAt,
                    });

                    // Trace one more level (retailer → consumer)
                    if (nextBuyer) {
                        const finalSales = txns.filter(
                            (t) => t.sellerId === nextBuyer.id && t.createdAt && resale.createdAt && t.createdAt >= resale.createdAt,
                        );
                        for (const final of finalSales.slice(0, 1)) {
                            const endBuyer = userMap.get(final.buyerId ?? "");
                            chain.push({
                                step: 3,
                                from: { name: nextBuyer.businessName, role: nextBuyer.role, tin: nextBuyer.tinNumber },
                                to: endBuyer ? { name: endBuyer.businessName, role: endBuyer.role, tin: endBuyer.tinNumber } : { name: final.buyerName, role: "consumer" },
                                unitPrice: final.unitPrice,
                                priceChange: `${final.unitPrice > resale.unitPrice ? "+" : ""}${final.unitPrice - resale.unitPrice} RWF (${Math.round(((final.unitPrice - resale.unitPrice) / resale.unitPrice) * 100)}%)`,
                                quantity: final.quantity,
                                date: final.createdAt,
                            });
                        }
                    }
                }
            }

            chains.push(chain);
        }

        return {
            found: true,
            product: prod.name,
            chainsTraced: chains.length,
            chains,
        };
    },
});

export const traceProductJourney = tool({
    description: "Trace a recorded product journey for an RRA audit or stock officer. Returns persisted transaction records and origin declarations separately. Batch declarations are not linked to transactions unless the database contains that relationship; do not infer allocations, missing quantities, or fraud.",
    inputSchema: z.object({
        query: z.string().trim().min(2).max(120).describe("Product name or ID, batch reference, business name/TIN, transaction, or import reference"),
        status: z.enum(["all", "pending", "confirmed", "completed", "rejected", "expired", "disputed"]).default("all"),
    }),
    execute: async ({ query, status }) => {
        const result = await searchProductJourney({ query, status, offset: 0 });
        return {
            found: result.records.length > 0 || result.sourceRecords.length > 0,
            transactionRecords: result.records.map(({ id, sellerName, sellerTin, sellerRole, buyerName, buyerTin, buyerRole, productName, quantity, unit, status: recordStatus, createdAt, confirmedAt, disputed }) => ({
                reference: id,
                seller: { name: sellerName, tin: sellerTin, role: sellerRole },
                buyer: { name: buyerName, tin: buyerTin, role: buyerRole },
                product: productName,
                quantity,
                unit,
                status: recordStatus,
                dispatchedAt: createdAt,
                receiptConfirmedAt: confirmedAt,
                disputed,
            })),
            originRecords: result.sourceRecords.map(({ kind, reference, businessName, businessTin, productName, quantity, status: sourceStatus, createdAt }) => ({
                kind,
                reference,
                businessName,
                businessTin,
                productName,
                declaredQuantity: quantity,
                status: sourceStatus,
                createdAt,
                downstreamBatchLink: "not recorded",
            })),
            totalTransactions: result.total,
            hasMore: result.hasMore,
            limitation: "Only recorded links are returned. A missing transaction or batch allocation is unknown, not a zero quantity or proof of misconduct.",
        };
    },
});

export const getImportDeclarations = tool({
    description: "Search existing import declarations for an authorized customs review. Returns only declaration records and recorded quantities; it does not confirm or alter declarations.",
    inputSchema: z.object({ query: z.string().trim().min(2).max(120) }),
    execute: async ({ query }) => {
        const match = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
        const rows = await db.select({
            id: importDeclaration.id,
            businessName: sql<string>`COALESCE(${user.businessName}, ${user.name})`,
            tin: user.tinNumber,
            productName: product.name,
            unit: product.unit,
            expectedQuantity: importDeclaration.expectedQuantity,
            actualQuantity: importDeclaration.actualQuantity,
            status: importDeclaration.status,
            customsReference: importDeclaration.customsRef,
            invoiceReference: importDeclaration.invoiceRef,
            createdAt: importDeclaration.createdAt,
        }).from(importDeclaration)
            .innerJoin(user, eq(importDeclaration.businessId, user.id))
            .innerJoin(product, eq(importDeclaration.productId, product.id))
            .where(or(
                ilike(importDeclaration.customsRef, match),
                ilike(importDeclaration.invoiceRef, match),
                ilike(product.name, match),
                ilike(user.tinNumber, match),
                ilike(user.businessName, match),
            ))
            .orderBy(desc(importDeclaration.createdAt))
            .limit(20);
        return { count: rows.length, declarations: rows, readOnly: true };
    },
});

/** Historical recipe-scoped manufacturing comparisons for the explicitly authorized formula roles. */
export const getProductionHistoryAnalysisTool = tool({
    description: "Analyze a manufacturer's recipe-linked production against earlier batches for the exact same recipe version. This tool is available only to roles with production.formula.read and may return confidential ingredient names and quantities. Use a manufacturer's TIN, optionally a specific batch reference or product name, and a bounded recent window. Baselines include only earlier batches already marked independently_supported and within_tolerance; unverified or flagged records are never used to train the baseline. Treat signals as human-review leads, not proof of wrongdoing. State the sample size, exact recipe version, rule version, limitations, and evidence batch references.",
    inputSchema: z.object({
        tin: z.string().trim().min(5).max(32).regex(/^[A-Za-z0-9-]+$/).describe("Manufacturer TIN"),
        batchReference: z.string().trim().min(1).max(128).optional().describe("Optional exact production batch reference"),
        productName: z.string().trim().min(2).max(160).optional().describe("Optional manufacturer product name filter"),
        lookbackDays: z.union([z.literal(30), z.literal(90), z.literal(180), z.literal(365)]).default(90)
            .describe("Recent candidate-batch window, default 90 days; verified baseline batches are selected separately"),
    }),
    execute: async ({ tin, batchReference, productName, lookbackDays }) =>
        getProductionHistoryAnalysis({ tin, batchReference, productName, lookbackDays }),
});
