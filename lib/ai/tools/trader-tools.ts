// Server-only — Trader-Scoped AI Tools
// These tools only access data belonging to the logged-in user.
// The userId is injected server-side by the API route — never from the client.
//
// IMPORTANT: All queries here MUST match the logic in dashboard.action.ts
// to ensure data consistency between the AI chat and the dashboard cards.

import { tool } from "ai";
import { z } from "zod";
import { eq, sql, desc, and, inArray } from "drizzle-orm";
import db from "@/db/drizzle";
import {
    user, transaction, stock, product, vatRecord,
    taxPayment, auditLog,
} from "@/db/schema";

// ---------------------------------------------------------------------------
// Factory: creates trader tools scoped to a specific userId.
// Called from the API route with the session userId.
// ---------------------------------------------------------------------------

export function createTraderTools(userId: string) {

    /** 
     * Get dashboard-aligned stats — EXACTLY matches getDashboardStats().
     * This is the primary tool for questions about totals, revenue, stock, VAT.
     */
    const getDashboardOverview = tool({
        description: "Get the trader's dashboard overview stats — total produced, total sold, remaining stock, sales value, VAT output, VAT input, net tax due, and pending counts. This is the most accurate source for summary numbers. Use this tool first when the user asks about their totals, revenue, stock levels, or tax status.",
        inputSchema: z.object({}),
        execute: async () => {
            // 1. Total stock (remaining) — matches dashboard.action.ts
            const stockResult = await db
                .select({
                    totalQuantity: sql<number>`COALESCE(SUM(${stock.quantity}), 0)`,
                    productCount: sql<number>`COUNT(*)`,
                })
                .from(stock)
                .where(eq(stock.businessId, userId));

            const remainingStock = Number(stockResult[0]?.totalQuantity) || 0;

            // 2. Transaction aggregates — ONLY confirmed/completed
            const salesResult = await db
                .select({
                    totalSold: sql<number>`COALESCE(SUM(${transaction.quantity}), 0)`,
                    totalSalesValue: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`,
                    txnCount: sql<number>`COUNT(*)`,
                })
                .from(transaction)
                .where(
                    and(
                        eq(transaction.sellerId, userId),
                        inArray(transaction.status, ["confirmed", "completed"]),
                    ),
                );

            const totalSold = Number(salesResult[0]?.totalSold) || 0;
            const totalSalesValue = Number(salesResult[0]?.totalSalesValue) || 0;
            const totalProduced = remainingStock + totalSold;

            // 3. VAT aggregates — matches dashboard exactly
            const vatResult = await db
                .select({
                    vatType: vatRecord.vatType,
                    total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`,
                })
                .from(vatRecord)
                .where(eq(vatRecord.businessId, userId))
                .groupBy(vatRecord.vatType);

            const taxGenerated = Number(vatResult.find((r) => r.vatType === "output")?.total) || 0;
            const taxPaid = Number(vatResult.find((r) => r.vatType === "input")?.total) || 0;
            const taxBalance = taxGenerated - taxPaid;

            // 4. Pending counts
            const pendingResult = await db
                .select({
                    pendingIncoming: sql<number>`COUNT(*) FILTER (WHERE ${transaction.buyerId} = ${userId} AND ${transaction.status} = 'pending')`,
                    pendingOutgoing: sql<number>`COUNT(*) FILTER (WHERE ${transaction.sellerId} = ${userId} AND ${transaction.status} = 'pending')`,
                })
                .from(transaction)
                .where(
                    sql`(${transaction.buyerId} = ${userId} OR ${transaction.sellerId} = ${userId}) AND ${transaction.status} = 'pending'`,
                );

            // 5. Tax payments
            const [payments] = await db
                .select({ total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8` })
                .from(taxPayment)
                .where(and(eq(taxPayment.businessId, userId), eq(taxPayment.status, "confirmed")));

            return {
                totalProduced,
                totalSold,
                remainingStock,
                salesValue: totalSalesValue,
                confirmedTransactionCount: Number(salesResult[0]?.txnCount) || 0,
                taxGenerated_vatOutput: taxGenerated,
                taxPaid_vatInput: taxPaid,
                netTaxDue: taxBalance,
                taxPaymentsMade: Number(payments?.total) || 0,
                pendingIncoming: Number(pendingResult[0]?.pendingIncoming) || 0,
                pendingOutgoing: Number(pendingResult[0]?.pendingOutgoing) || 0,
                note: "These numbers match the dashboard cards exactly. Sales Value and Tax only include confirmed/completed transactions.",
            };
        },
    });

    /** Get trader's recent transactions — filtered by status. */
    const getMyTransactions = tool({
        description: "Get the logged-in trader's recent transactions. By default only shows confirmed/completed transactions. Use for listing individual transactions with details.",
        inputSchema: z.object({
            type: z.enum(["sales", "purchases", "all"]).default("all").describe("Filter: sales (as seller), purchases (as buyer), or all"),
            status: z.enum(["confirmed", "pending", "rejected", "all"]).default("confirmed").describe("Transaction status filter. Default: confirmed only"),
            limit: z.number().min(1).max(50).default(20),
        }),
        execute: async ({ type, status, limit }) => {
            const conditions = [];

            if (type === "sales") {
                conditions.push(eq(transaction.sellerId, userId));
            } else if (type === "purchases") {
                conditions.push(eq(transaction.buyerId, userId));
            } else {
                conditions.push(
                    sql`(${transaction.sellerId} = ${userId} OR ${transaction.buyerId} = ${userId})`,
                );
            }

            // Status filter — default to confirmed only (matches dashboard)
            if (status !== "all") {
                conditions.push(eq(transaction.status, status));
            }

            const txns = await db
                .select({
                    id: transaction.id,
                    productName: product.name,
                    quantity: transaction.quantity,
                    unitPrice: transaction.unitPrice,
                    totalAmount: transaction.totalAmount,
                    vatAmount: transaction.vatAmount,
                    status: transaction.status,
                    buyerName: transaction.buyerName,
                    createdAt: transaction.createdAt,
                    isSale: sql<boolean>`${transaction.sellerId} = ${userId}`,
                })
                .from(transaction)
                .innerJoin(product, eq(transaction.productId, product.id))
                .where(and(...conditions))
                .orderBy(desc(transaction.createdAt))
                .limit(limit);

            return {
                count: txns.length,
                statusFilter: status,
                transactions: txns,
                summary: {
                    totalValue: txns.reduce((s, t) => s + t.totalAmount, 0),
                    totalVat: txns.reduce((s, t) => s + t.vatAmount, 0),
                },
            };
        },
    });

    /** Get trader's current stock/inventory with product details. */
    const getMyStock = tool({
        description: "Get the logged-in trader's current inventory — all products with quantities, prices, and sources. Quantities match the dashboard's Remaining Stock card.",
        inputSchema: z.object({}),
        execute: async () => {
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
                .where(eq(stock.businessId, userId));

            const totalUnits = inventory.reduce((s, i) => s + i.quantity, 0);

            return {
                itemCount: inventory.length,
                totalUnits,
                inventory,
                totalStockValue: inventory.reduce(
                    (s, i) => s + (i.quantity * (i.price ?? 0)),
                    0,
                ),
            };
        },
    });

    /** Get trader's tax/VAT status — matches dashboard cards exactly. */
    const getMyTaxStatus = tool({
        description: "Get the logged-in trader's VAT/tax status — VAT output (tax generated), VAT input (tax paid/credited), net tax due, and tax payments made. Numbers match the dashboard Tax Generated, Tax Paid, and Tax Balance cards.",
        inputSchema: z.object({}),
        execute: async () => {
            // VAT aggregates — same query as dashboard
            const vatResult = await db
                .select({
                    vatType: vatRecord.vatType,
                    total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`,
                })
                .from(vatRecord)
                .where(eq(vatRecord.businessId, userId))
                .groupBy(vatRecord.vatType);

            const taxGenerated = Number(vatResult.find((r) => r.vatType === "output")?.total) || 0;
            const taxPaid = Number(vatResult.find((r) => r.vatType === "input")?.total) || 0;
            const netTaxDue = taxGenerated - taxPaid;

            // Actual payments made to RRA
            const [payments] = await db
                .select({ total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8` })
                .from(taxPayment)
                .where(and(eq(taxPayment.businessId, userId), eq(taxPayment.status, "confirmed")));

            const paymentsMade = Number(payments?.total) || 0;

            return {
                vatOutput_taxGenerated: taxGenerated,
                vatInput_taxPaid: taxPaid,
                netTaxDue,
                taxPaymentsMade: paymentsMade,
                outstanding: netTaxDue - paymentsMade,
                compliancePercentage: netTaxDue > 0 ? Math.round((paymentsMade / netTaxDue) * 100) : 100,
            };
        },
    });

    /** Get trader's own profile info. */
    const getMyProfile = tool({
        description: "Get the logged-in trader's business profile — name, TIN, role, clearance status.",
        inputSchema: z.object({}),
        execute: async () => {
            const [profile] = await db
                .select({
                    name: user.name,
                    businessName: user.businessName,
                    tinNumber: user.tinNumber,
                    role: user.role,
                    clearanceStatus: user.clearanceStatus,
                    email: user.email,
                    createdAt: user.createdAt,
                })
                .from(user)
                .where(eq(user.id, userId))
                .limit(1);

            return profile ?? { error: "Profile not found" };
        },
    });

    /** Explain VAT calculation and answer tax questions. */
    const explainVat = tool({
        description: "Explain how VAT is calculated in Rwanda. Use when the trader asks about VAT, tax rates, or why their tax changed. Also provides the trader's current VAT breakdown.",
        inputSchema: z.object({
            includeBreakdown: z.boolean().default(false).describe("Include the trader's current VAT breakdown"),
        }),
        execute: async ({ includeBreakdown }) => {
            const explanation = {
                vatRate: "18% (Rwanda standard rate)",
                howItWorks: "VAT is charged on each transaction. Output VAT (on sales) minus Input VAT (on purchases) = Net VAT owed to RRA.",
                outputVat: "Tax Generated — charged when you sell goods. Calculated as: sale amount × 18%",
                inputVat: "Tax Paid/Credited — credited when you purchase goods from a VAT-registered supplier. This reduces your total VAT owed.",
                netOwed: "Tax Balance = Tax Generated - Tax Paid. If positive, you owe RRA. If negative, you have credit.",
                filingPeriod: "VAT returns are typically filed monthly by the 15th of the following month.",
            };

            if (!includeBreakdown) return explanation;

            // Use same query as dashboard
            const vatResult = await db
                .select({
                    vatType: vatRecord.vatType,
                    total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`,
                })
                .from(vatRecord)
                .where(eq(vatRecord.businessId, userId))
                .groupBy(vatRecord.vatType);

            const taxGenerated = Number(vatResult.find((r) => r.vatType === "output")?.total) || 0;
            const taxPaidVat = Number(vatResult.find((r) => r.vatType === "input")?.total) || 0;

            return {
                ...explanation,
                yourBreakdown: {
                    taxGenerated_vatOutput: taxGenerated,
                    taxPaid_vatInput: taxPaidVat,
                    netTaxDue: taxGenerated - taxPaidVat,
                },
            };
        },
    });

    /** Platform help and guidance. */
    const systemHelp = tool({
        description: "Answer questions about using the TaxFlow platform — how to record sales, confirm transactions, manage stock, file disputes, etc. No database access needed.",
        inputSchema: z.object({
            topic: z.string().describe("The topic the user is asking about"),
        }),
        execute: async ({ topic }) => {
            const guides: Record<string, string> = {
                "record sale": "Go to 'Record Sale' in the sidebar. Select the products, enter quantity and price, and click 'Confirm Sale'. Stock is deducted immediately.",
                "sell": "Go to 'Sell to Buyer' in the sidebar. Search for a buyer by TIN, select the product, enter quantity and price. The buyer must confirm the transaction from their 'Pending' page.",
                "confirm transaction": "Go to 'Pending' in the sidebar. Incoming transactions from your suppliers appear here. Click 'Confirm' to accept or 'Reject' to decline.",
                "dispute": "Go to 'Disputes' to file a dispute against a transaction. Provide a reason and evidence. The counterparty and RRA will review it.",
                "stock": "Go to 'Inventory' to see your current stock. Stock updates automatically when you sell or receive goods.",
                "inventory": "Go to 'Inventory' to see your current stock levels, prices, and sources for all your products.",
                "vat": "Go to 'Payments & VAT' to view your VAT status. Tax Generated (output VAT from sales) minus Tax Paid (input VAT from purchases) = your Net Tax Due.",
                "tax report": "Go to 'Tax Report' to generate and view your tax filing reports for any period.",
                "payment": "Go to 'Payments & VAT' to make tax payments via mobile money or bank transfer.",
                "production": "Go to 'Dashboard' and use the 'Monthly Production' chart to track your production. Manufacturers can record production from the Production page.",
                "settings": "Go to 'Settings' to update your business information and preferences.",
                "export": "Go to 'Export Report' to download your transaction and tax data.",
                "notifications": "Go to 'Notifications' to see alerts about incoming transactions, confirmations, and system updates.",
            };

            const lowerTopic = topic.toLowerCase();
            const match = Object.entries(guides).find(([key]) =>
                lowerTopic.includes(key),
            );

            return {
                topic,
                guide: match
                    ? match[1]
                    : "I can help with: recording sales, selling to buyers, confirming transactions, disputes, stock/inventory management, VAT, tax reports, payments, production, settings, exports, and notifications. Please ask about one of these topics.",
                availableTopics: Object.keys(guides),
            };
        },
    });

    /** Get monthly stats — matches getMonthlyStats() for charts. */
    const getMonthlyStats = tool({
        description: "Get the trader's monthly sales and production data — same numbers shown in the dashboard charts. Use when asked about monthly trends or performance.",
        inputSchema: z.object({}),
        execute: async () => {
            const now = new Date();
            const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const rangeStart = prevDate.toISOString();

            // Monthly sales — confirmed/completed only
            const rawSales = await db
                .select({
                    month: sql<string>`TO_CHAR(${transaction.createdAt}, 'Mon')`,
                    total: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`,
                    unitsSold: sql<number>`COALESCE(SUM(${transaction.quantity}), 0)`,
                })
                .from(transaction)
                .where(
                    and(
                        eq(transaction.sellerId, userId),
                        inArray(transaction.status, ["confirmed", "completed"]),
                        sql`${transaction.createdAt} >= ${rangeStart}`,
                    ),
                )
                .groupBy(sql`TO_CHAR(${transaction.createdAt}, 'Mon')`)
                .orderBy(sql`TO_CHAR(${transaction.createdAt}, 'Mon')`);

            // Monthly production from audit log
            const rawProduction = await db
                .select({
                    month: sql<string>`TO_CHAR(${auditLog.createdAt}, 'Mon')`,
                    total: sql<number>`COALESCE(SUM((${auditLog.metadata}::jsonb->>'quantity')::int), 0)`,
                })
                .from(auditLog)
                .where(
                    and(
                        eq(auditLog.userId, userId),
                        eq(auditLog.action, "PRODUCTION_RECORDED"),
                        sql`${auditLog.createdAt} >= ${rangeStart}`,
                    ),
                )
                .groupBy(sql`TO_CHAR(${auditLog.createdAt}, 'Mon')`)
                .orderBy(sql`TO_CHAR(${auditLog.createdAt}, 'Mon')`);

            return {
                monthlySales: rawSales,
                monthlyProduction: rawProduction,
                note: "Data covers the current and previous month. Sales only include confirmed/completed transactions.",
            };
        },
    });

    return {
        getDashboardOverview,
        getMyTransactions,
        getMyStock,
        getMyTaxStatus,
        getMyProfile,
        explainVat,
        systemHelp,
        getMonthlyStats,
    };
}
