"use server";

import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { createHash } from "node:crypto";
import db from "@/db/drizzle";
import { auditLog, dispute, importDeclaration, productionBatch, product, stockAdjustment, transaction, user } from "@/db/schema";
import { requireRRAPermission } from "@/lib/auth-guard";
import { productJourneyQuerySchema } from "@/lib/validation/product-journey.schema";

const PAGE_SIZE = 100;

export type ProductJourneyPage = {
    records: {
        id: string;
        sellerId: string;
        sellerName: string;
        sellerTin: string | null;
        sellerRole: string;
        buyerId: string | null;
        buyerName: string;
        buyerTin: string | null;
        buyerRole: string | null;
        productId: string;
        productName: string;
        unit: string;
        quantity: number;
        status: string;
        createdAt: Date;
        confirmedAt: Date | null;
        disputed: boolean;
        disputeId: string | null;
        recordUrl: string;
    }[];
    sourceRecords: {
        id: string;
        kind: "production_batch" | "import_declaration" | "stock_adjustment";
        reference: string;
        businessName: string;
        businessTin: string | null;
        productName: string;
        productId: string;
        quantity: number;
        status: string;
        createdAt: Date;
        recordUrl: string;
    }[];
    total: number;
    hasMore: boolean;
    offset: number;
};

/** RRA-only search over real transaction and origin records. Each read is audit logged. */
export async function searchProductJourney(input: unknown): Promise<ProductJourneyPage> {
    const { user: officer } = await requireRRAPermission("traceability.read");
    const parsed = productJourneyQuerySchema.safeParse(input);
    if (!parsed.success) throw new Error("Invalid product journey search.");
    const query = parsed.data;
    if (query.query.length > 0 && query.query.length < 2) {
        throw new Error("Enter at least two characters to search.");
    }

    const text = query.query ? `%${query.query.replace(/[\\%_]/g, "\\$&")}%` : null;
    const dateConditions = [
        query.from ? gte(transaction.createdAt, new Date(query.from)) : undefined,
        query.to ? lte(transaction.createdAt, new Date(query.to)) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
    const statusCondition = query.status === "disputed"
        ? undefined
        : query.status === "all"
            ? undefined
            : eq(transaction.status, query.status);
    const searchCondition = text ? or(
        ilike(product.name, text),
        ilike(product.id, text),
        ilike(transaction.id, text),
        ilike(user.businessName, text),
        ilike(user.name, text),
        ilike(user.tinNumber, text),
    ) : undefined;

    return db.transaction(async (tx) => {
        const buyer = alias(user, "buyer");
        const matchingBatches = text
            ? await tx.select({ productId: productionBatch.productId }).from(productionBatch).where(ilike(productionBatch.batchReference, text))
            : [];
        const matchingImports = text
            ? await tx.select({ productId: importDeclaration.productId }).from(importDeclaration).where(or(
                ilike(importDeclaration.customsRef, text),
                ilike(importDeclaration.invoiceRef, text),
            ))
            : [];
        const matchingAdjustments = text
            ? await tx.select({ productId: stockAdjustment.productId }).from(stockAdjustment).where(ilike(stockAdjustment.batchReference, text))
            : [];
        const extraProductIds = [...new Set([...matchingBatches, ...matchingImports, ...matchingAdjustments].map((row) => row.productId))];
        const searchMatches = text ? [
            ilike(product.name, text),
            ilike(product.id, text),
            ilike(transaction.id, text),
            ilike(user.businessName, text),
            ilike(user.name, text),
            ilike(user.tinNumber, text),
            ilike(buyer.businessName, text),
            ilike(buyer.name, text),
            ilike(buyer.tinNumber, text),
            ...(extraProductIds.length > 0 ? [inArray(transaction.productId, extraProductIds)] : []),
        ] : [];
        const allConditions = [...dateConditions, statusCondition, searchCondition].filter(
            (condition): condition is NonNullable<typeof condition> => Boolean(condition),
        );
        if (query.status === "disputed") allConditions.push(sql`${transaction.id} IN (SELECT transaction_id FROM dispute)`);
        if (text) {
            const searchIndex = allConditions.indexOf(searchCondition!);
            if (searchIndex >= 0) allConditions[searchIndex] = or(...searchMatches)!;
            else allConditions.push(or(...searchMatches)!);
        }
        const base = tx.select({
            id: transaction.id,
            sellerId: transaction.sellerId,
            sellerName: sql<string>`COALESCE(${user.businessName}, ${user.name})`,
            sellerTin: user.tinNumber,
            sellerRole: user.role,
            buyerId: transaction.buyerId,
            buyerName: sql<string>`COALESCE(${buyer.businessName}, ${buyer.name}, ${transaction.buyerName}, 'Recorded consumer')`,
            buyerTin: buyer.tinNumber,
            buyerRole: buyer.role,
            productId: product.id,
            productName: product.name,
            unit: product.unit,
            quantity: transaction.quantity,
            status: transaction.status,
            createdAt: transaction.createdAt,
            confirmedAt: transaction.confirmedAt,
        }).from(transaction)
            .innerJoin(product, eq(transaction.productId, product.id))
            .innerJoin(user, eq(transaction.sellerId, user.id))
            .leftJoin(buyer, eq(transaction.buyerId, buyer.id))
            .where(allConditions.length > 0 ? and(...allConditions) : undefined);

        const [countRow] = await tx.select({ total: sql<number>`count(*)::int` })
            .from(transaction)
            .innerJoin(product, eq(transaction.productId, product.id))
            .innerJoin(user, eq(transaction.sellerId, user.id))
            .leftJoin(buyer, eq(transaction.buyerId, buyer.id))
            .where(allConditions.length > 0 ? and(...allConditions) : undefined);
        const total = countRow?.total ?? 0;
        const pageRows = await base.orderBy(desc(transaction.createdAt), desc(transaction.id))
            .limit(PAGE_SIZE).offset(query.offset);
        const rowIds = pageRows.map((row) => row.id);
        const disputeRows = rowIds.length > 0
            ? await tx.select({ transactionId: dispute.transactionId, id: dispute.id })
                .from(dispute).where(inArray(dispute.transactionId, rowIds))
            : [];
        const disputeByTransaction = new Map(disputeRows.map((row) => [row.transactionId, row.id]));
        const records = pageRows.map((row) => {
            const disputeId = disputeByTransaction.get(row.id) ?? null;
            return {
                ...row,
                disputed: disputeId !== null,
                disputeId,
                recordUrl: `/admin/transactions?search=${encodeURIComponent(row.id)}`,
            };
        });

        const matchedProducts = new Set(records.map((row) => row.productId));
        if (query.query) {
            matchingBatches.forEach((row) => matchedProducts.add(row.productId));
            matchingImports.forEach((row) => matchedProducts.add(row.productId));
        }

        const productIds = [...matchedProducts];
        const sourceRows = productIds.length > 0
            ? await Promise.all([
                tx.select({
                    id: productionBatch.id,
                    reference: productionBatch.batchReference,
                    businessName: sql<string>`COALESCE(${user.businessName}, ${user.name})`,
                    businessTin: user.tinNumber,
                    productName: product.name,
                    productId: product.id,
                    quantity: productionBatch.declaredQuantity,
                    status: sql<string>`COALESCE(${productionBatch.status}, 'declared')`,
                    createdAt: productionBatch.createdAt,
                }).from(productionBatch)
                    .innerJoin(user, eq(productionBatch.manufacturerId, user.id))
                    .innerJoin(product, eq(productionBatch.productId, product.id))
                    .where(inArray(productionBatch.productId, productIds))
                    .orderBy(desc(productionBatch.createdAt)).limit(100),
                tx.select({
                    id: importDeclaration.id,
                    reference: sql<string>`COALESCE(${importDeclaration.customsRef}, ${importDeclaration.invoiceRef}, ${importDeclaration.id})`,
                    businessName: sql<string>`COALESCE(${user.businessName}, ${user.name})`,
                    businessTin: user.tinNumber,
                    productName: product.name,
                    productId: product.id,
                    quantity: sql<number>`COALESCE(${importDeclaration.actualQuantity}, ${importDeclaration.expectedQuantity})`,
                    status: importDeclaration.status,
                    createdAt: importDeclaration.createdAt,
                }).from(importDeclaration)
                    .innerJoin(user, eq(importDeclaration.businessId, user.id))
                    .innerJoin(product, eq(importDeclaration.productId, product.id))
                    .where(inArray(importDeclaration.productId, productIds))
                    .orderBy(desc(importDeclaration.createdAt)).limit(100),
                tx.select({
                    id: stockAdjustment.id,
                    reference: sql<string>`COALESCE(${stockAdjustment.batchReference}, ${stockAdjustment.id})`,
                    businessName: sql<string>`COALESCE(${user.businessName}, ${user.name})`,
                    businessTin: user.tinNumber,
                    productName: product.name,
                    productId: product.id,
                    quantity: stockAdjustment.quantityDelta,
                    status: sql<string>`CASE WHEN ${stockAdjustment.approvedById} IS NULL THEN 'approval not recorded' ELSE 'approved' END`,
                    createdAt: stockAdjustment.createdAt,
                }).from(stockAdjustment)
                    .innerJoin(user, eq(stockAdjustment.businessId, user.id))
                    .innerJoin(product, eq(stockAdjustment.productId, product.id))
                    .where(inArray(stockAdjustment.productId, productIds))
                    .orderBy(desc(stockAdjustment.createdAt)).limit(100),
            ])
            : [[], [], []];
        const sourceRecords = [
            ...sourceRows[0].map((row) => ({ ...row, kind: "production_batch" as const, recordUrl: `/admin/stock?product=${encodeURIComponent(row.productId)}` })),
            ...sourceRows[1].map((row) => ({ ...row, kind: "import_declaration" as const, recordUrl: `/admin/imports?search=${encodeURIComponent(row.reference)}` })),
            ...sourceRows[2].map((row) => ({ ...row, kind: "stock_adjustment" as const, recordUrl: `/admin/stock?product=${encodeURIComponent(row.productId)}` })),
        ];

        const searchHash = query.query ? createHash("sha256").update(query.query.toLowerCase()).digest("hex") : null;
        await tx.insert(auditLog).values({
            userId: officer.id,
            action: "PRODUCT_JOURNEY_SEARCH",
            targetType: "product_journey",
            targetId: productIds.length === 1 ? productIds[0] : null,
            metadata: JSON.stringify({ queryHash: searchHash, status: query.status, from: query.from, to: query.to, offset: query.offset, resultCount: records.length }),
        });

        return { records, sourceRecords, total, hasMore: query.offset + pageRows.length < total, offset: query.offset };
    });
}
