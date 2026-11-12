// Server-only — Trader-Scoped AI Tools
// These tools only access data belonging to the logged-in user.
// The userId is injected server-side by the API route — never from the client.
//
// IMPORTANT: All queries here MUST match the logic in dashboard.action.ts
// to ensure data consistency between the AI chat and the dashboard cards.

import { tool } from "ai";
import { z } from "zod";
import { eq, sql, desc, and, gte, inArray, or } from "drizzle-orm";
import db from "@/db/drizzle";
import {
    user, transaction, stock, product, vatRecord,
    taxPayment, auditLog, productionBatch, importDeclaration,
    stockAdjustment, aiFinding,
} from "@/db/schema";
import { buildRiskAlerts } from "@/lib/intelligence/risk-rules";
import { getSystemConfig } from "@/lib/actions/system-config.action";
import { buildVatGuidance } from "@/lib/ai/vat-guidance";

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
        description: "Explain TaxFlow's configured VAT arithmetic and, optionally, the logged-in trader's unfrozen VAT records. This tool does not provide official RRA tax law, exemptions, or filing deadlines.",
        inputSchema: z.object({
            includeBreakdown: z.boolean().default(false).describe("Include the trader's current VAT breakdown"),
        }),
        execute: async ({ includeBreakdown }) => {
            const config = await getSystemConfig();
            const explanation = buildVatGuidance(config.vatRate);

            if (!includeBreakdown) return explanation;

            // Use same query as dashboard
            const vatResult = await db
                .select({
                    vatType: vatRecord.vatType,
                    total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`,
                })
                .from(vatRecord)
                .where(and(eq(vatRecord.businessId, userId), eq(vatRecord.isFrozen, false)))
                .groupBy(vatRecord.vatType);

            const taxGenerated = Number(vatResult.find((r) => r.vatType === "output")?.total) || 0;
            const taxPaidVat = Number(vatResult.find((r) => r.vatType === "input")?.total) || 0;

            return {
                ...explanation,
                yourBreakdown: {
                    taxGenerated_vatOutput: taxGenerated,
                    taxPaid_vatInput: taxPaidVat,
                    recordedNetVatPosition: taxGenerated - taxPaidVat,
                    note: "Calculated from this trader's unfrozen TaxFlow VAT records; not an official RRA balance.",
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

    /** Explainable review alerts scoped to the signed-in trader. */
    const getMyRiskAlerts = tool({
        description: "Get explainable TaxFlow review alerts for the logged-in trader's own recent transactions, inventory, and payment records. Alerts are indicators for human review, not fraud findings or official RRA assessments. Use when asked about unusual activity, mismatches, pending confirmations, payment status, or risk alerts.",
        inputSchema: z.object({
            limit: z.number().int().min(1).max(20).default(10),
        }),
        execute: async ({ limit }) => {
            const [config, transactions, inventory, payments] = await Promise.all([
                getSystemConfig(),
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
                transactions,
                stock: inventory,
                payments,
                vatRate: config.vatRate,
            });

            return {
                count: alerts.length,
                alerts: alerts.slice(0, limit),
                note: "Rule-based alerts are explainable review signals, not proof of fraud. Historical tax-rule versions may differ from the current configured VAT rate.",
            };
        },
    });


    // -----------------------------------------------------------------------
    // Tool: getMyProductionHistory
    // -----------------------------------------------------------------------
    const getMyProductionHistory = tool({
        description: 'Get the production batch history for the logged-in manufacturer. Returns declared production quantities per product and period for the last 90 days.',
        inputSchema: z.object({
            productId: z.string().optional().describe('Filter to a specific product ID.'),
            limit: z.number().int().min(1).max(50).default(20),
        }),
        execute: async ({ productId, limit }: { productId?: string; limit: number }) => {
            const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
            const rows = await db
                .select({
                    id: productionBatch.id,
                    productId: productionBatch.productId,
                    productName: product.name,
                    declaredQuantity: productionBatch.declaredQuantity,
                    periodStart: productionBatch.periodStart,
                    periodEnd: productionBatch.periodEnd,
                    status: productionBatch.status,
                })
                .from(productionBatch)
                .leftJoin(product, eq(product.id, productionBatch.productId))
                .where(
                    and(
                        eq(productionBatch.manufacturerId, userId),
                        gte(productionBatch.periodStart, ninetyDaysAgo),
                        productId ? eq(productionBatch.productId, productId) : sql`true`,
                    ),
                )
                .orderBy(desc(productionBatch.periodStart))
                .limit(limit);
            return {
                batches: rows,
                note: 'Declared production quantities only. Must be reconciled against stock movements for compliance.',
            };
        },
    });

    // -----------------------------------------------------------------------
    // Tool: getMyImportDeclarations
    // -----------------------------------------------------------------------
    const getMyImportDeclarations = tool({
        description: 'Get import declarations for the logged-in manufacturer or wholesaler, including expected vs actual quantities and current status.',
        inputSchema: z.object({
            status: z.enum(['pending', 'submitted', 'approved', 'rejected']).optional().describe('Filter by status.'),
            limit: z.number().int().min(1).max(50).default(20),
        }),
        execute: async ({ status, limit }: { status?: 'pending' | 'submitted' | 'approved' | 'rejected'; limit: number }) => {
            const rows = await db
                .select({
                    id: importDeclaration.id,
                    declarationRef: importDeclaration.declarationRef,
                    productId: importDeclaration.productId,
                    productName: product.name,
                    expectedQuantity: importDeclaration.expectedQuantity,
                    actualQuantity: importDeclaration.actualQuantity,
                    inspectedQuantity: importDeclaration.inspectedQuantity,
                    status: importDeclaration.status,
                    supplier: importDeclaration.supplier,
                    originCountry: importDeclaration.originCountry,
                    createdAt: importDeclaration.createdAt,
                })
                .from(importDeclaration)
                .leftJoin(product, eq(product.id, importDeclaration.productId))
                .where(
                    and(
                        eq(importDeclaration.businessId, userId),
                        status ? eq(importDeclaration.status, status) : sql`true`,
                    ),
                )
                .orderBy(desc(importDeclaration.createdAt))
                .limit(limit);
            return {
                declarations: rows,
                note: 'Discrepancies between expected and actual/inspected quantities may be flagged by RRA for review.',
            };
        },
    });

    // -----------------------------------------------------------------------
    // Tool: getMyStockLossHistory
    // -----------------------------------------------------------------------
    const getMyStockLossHistory = tool({
        description: 'Get the stock loss declaration history for the logged-in business. Repeated losses trigger AI monitoring flags.',
        inputSchema: z.object({
            productId: z.string().optional().describe('Filter by product ID.'),
            limit: z.number().int().min(1).max(50).default(20),
        }),
        execute: async ({ productId, limit }: { productId?: string; limit: number }) => {
            const rows = await db
                .select({
                    id: stockAdjustment.id,
                    productId: stockAdjustment.productId,
                    productName: product.name,
                    quantityDelta: stockAdjustment.quantityDelta,
                    adjustmentType: stockAdjustment.adjustmentType,
                    reason: stockAdjustment.reason,
                    createdAt: stockAdjustment.createdAt,
                })
                .from(stockAdjustment)
                .leftJoin(product, eq(product.id, stockAdjustment.productId))
                .where(
                    and(
                        eq(stockAdjustment.businessId, userId),
                        eq(stockAdjustment.adjustmentType, 'loss'),
                        productId ? eq(stockAdjustment.productId, productId) : sql`true`,
                    ),
                )
                .orderBy(desc(stockAdjustment.createdAt))
                .limit(limit);
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const recentCount = rows.filter((r) => new Date(r.createdAt) >= thirtyDaysAgo).length;
            const warningMsg = `WARNING: ${recentCount} loss events in the last 30 days. This pattern triggers an automatic AI flag for RRA review.`;
            return {
                losses: rows,
                recentCount,
                warningThreshold: 3,
                note: recentCount >= 3 ? warningMsg : 'Loss history is within normal range.',
            };
        },
    });

    // -----------------------------------------------------------------------
    // Tool: getMyAIFindings
    // -----------------------------------------------------------------------
    const getMyAIFindings = tool({
        description: 'Get open AI-generated compliance findings for the logged-in business. These are review signals, not accusations.',
        inputSchema: z.object({
            severity: z.enum(['info', 'warning', 'critical']).optional().describe('Filter by severity level.'),
            limit: z.number().int().min(1).max(20).default(10),
        }),
        execute: async ({ severity, limit }: { severity?: 'info' | 'warning' | 'critical'; limit: number }) => {
            const rows = await db
                .select({
                    id: aiFinding.id,
                    findingType: aiFinding.findingType,
                    severity: aiFinding.severity,
                    explanation: aiFinding.explanation,
                    observedValue: aiFinding.observedValue,
                    expectedValue: aiFinding.expectedValue,
                    reviewStatus: aiFinding.reviewStatus,
                    createdAt: aiFinding.createdAt,
                    updatedAt: aiFinding.updatedAt,
                })
                .from(aiFinding)
                .where(
                    and(
                        eq(aiFinding.businessId, userId),
                        severity ? eq(aiFinding.severity, severity) : sql`true`,
                    ),
                )
                .orderBy(desc(aiFinding.createdAt))
                .limit(limit);
            return {
                findings: rows,
                openCount: rows.filter((f) => f.reviewStatus === 'open').length,
                note: 'System-generated review signals only. Human RRA officer review required before any action.',
            };
        },
    });

    // -----------------------------------------------------------------------
    // Tool: getMyComplianceSnapshot
    // -----------------------------------------------------------------------
    const getMyComplianceSnapshot = tool({
        description: 'Get a 30-day compliance snapshot: production declared, sales, stock balances, and open AI findings count.',
        inputSchema: z.object({}),
        execute: async () => {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const [productionTotal] = await db
                .select({ total: sql<number>`COALESCE(SUM(${productionBatch.declaredQuantity}), 0)::float8` })
                .from(productionBatch)
                .where(and(eq(productionBatch.manufacturerId, userId), gte(productionBatch.periodStart, thirtyDaysAgo)));
            const [salesTotal] = await db
                .select({ total: sql<number>`COALESCE(SUM(${transaction.quantity}), 0)::float8` })
                .from(transaction)
                .where(and(
                    eq(transaction.sellerId, userId),
                    inArray(transaction.status, ['confirmed', 'completed']),
                    gte(transaction.createdAt, thirtyDaysAgo),
                ));
            const stockRows = await db
                .select({ productId: stock.productId, quantity: stock.quantity, productName: product.name })
                .from(stock)
                .leftJoin(product, eq(product.id, stock.productId))
                .where(eq(stock.businessId, userId));
            const [openFindings] = await db
                .select({ count: sql<number>`COUNT(*)::int` })
                .from(aiFinding)
                .where(and(eq(aiFinding.businessId, userId), eq(aiFinding.reviewStatus, 'open')));
            const [criticalFindings] = await db
                .select({ count: sql<number>`COUNT(*)::int` })
                .from(aiFinding)
                .where(and(
                    eq(aiFinding.businessId, userId),
                    eq(aiFinding.reviewStatus, 'open'),
                    eq(aiFinding.severity, 'critical'),
                ));
            return {
                period: 'last 30 days',
                productionDeclared: productionTotal?.total ?? 0,
                salesConfirmed: salesTotal?.total ?? 0,
                stockBalances: stockRows,
                openAIFindings: openFindings?.count ?? 0,
                criticalAIFindings: criticalFindings?.count ?? 0,
                note: 'If salesConfirmed exceeds productionDeclared with no matching purchases, an AI signal may have been generated for RRA review.',
            };
        },
    });

    // -----------------------------------------------------------------------
    // Tool: explainAIFinding
    // -----------------------------------------------------------------------
    const explainAIFinding = tool({
        description: 'Explain what a specific AI finding type means, why it was triggered, and what the manufacturer should do.',
        inputSchema: z.object({
            findingType: z.string().describe('Finding type code, e.g. rapid_stock_depletion or sales_without_production'),
        }),
        execute: async ({ findingType }: { findingType: string }) => {
            const explanations: Record<string, { what: string; why: string; action: string }> = {
                rapid_stock_depletion: {
                    what: 'More than 80% of your stock was sold in a single transaction.',
                    why: 'Sudden large sales can indicate stock diversion outside proper tax channels.',
                    action: 'Ensure all large sales are invoiced and your buyer is registered. Keep transaction records.',
                },
                sales_without_production: {
                    what: 'Sales recorded with no declared production or purchases in the same 30-day window.',
                    why: 'All sales require a declared source. Missing declarations suggest possible off-system stock.',
                    action: 'Review and submit any missing production batch declarations.',
                },
                import_vs_stock_mismatch: {
                    what: 'Import declaration shows less than 90% of declared quantity received.',
                    why: 'Goods declared at the border but not stocked may have been diverted.',
                    action: 'Verify receiving records match your import declaration and document any shortfall.',
                },
                production_efficiency_anomaly: {
                    what: 'Latest production batch is more than 50% above or below your 90-day average.',
                    why: 'Large deviations may indicate over- or under-declaration of output.',
                    action: 'Ensure declared quantities match actual factory output with supporting records.',
                },
                repeated_stock_loss: {
                    what: '3 or more stock loss declarations in the last 30 days.',
                    why: 'Frequent losses can be used to reduce taxable stock. The pattern triggers review.',
                    action: 'Maintain detailed loss records (cause, quantity, date, witnesses).',
                },
                inventory_discrepancy: {
                    what: 'Mismatch detected between recorded transactions and your current stock level.',
                    why: 'Stock should equal opening + production/purchases minus sales/losses.',
                    action: 'Review recent movements and reconcile against your physical inventory count.',
                },
            };
            const info = explanations[findingType] ?? {
                what: `Finding type '${findingType}' detected by the AI monitoring system.`,
                why: 'An anomaly was detected in your business data relative to expected patterns.',
                action: 'Review recent transactions and declarations. Contact your RRA officer if needed.',
            };
            return {
                findingType,
                ...info,
                disclaimer: 'AI findings are review signals only. Human RRA officer review is required before any action. A finding does not constitute a tax assessment, penalty, or accusation.',
            };
        },
    });

    return {
        getDashboardOverview,
        getMyRiskAlerts,
        getMyTransactions,
        getMyStock,
        getMyTaxStatus,
        getMyProfile,
        explainVat,
        systemHelp,
        getMonthlyStats,
        getMyProductionHistory,
        getMyImportDeclarations,
        getMyStockLossHistory,
        getMyAIFindings,
        getMyComplianceSnapshot,
        explainAIFinding,
    };
}
