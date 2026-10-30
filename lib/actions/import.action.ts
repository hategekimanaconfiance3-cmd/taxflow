"use server";

import { eq, desc, and, sql } from "drizzle-orm";
import db from "@/db/drizzle";
import { importDeclaration, product, productionMaterial, productionMaterialMovement, productionMaterialReceipt, stock, stockMovement, user, auditLog } from "@/db/schema";
import { requireTraderSession, requireRRASession } from "@/lib/auth-guard";
import { hasRRAPermission } from "@/lib/rra-rbac";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { emitToUser } from "@/lib/realtime";
import { ensureImportDocumentExists, isImportFilenameForDeclaration } from "@/lib/import-files";
import { decimalToMicros, microsToDecimal, quantityToMicros } from "@/lib/material-accounting";
import {
    confirmImportArrivalSchema,
    declareImportSchema,
    importDeclarationIdSchema,
    rejectImportArrivalSchema,
    submitImportArrivalSchema,
} from "@/lib/validation/import.schema";

async function requireApprovedImportTrader() {
    const session = await requireTraderSession(["manufacturer", "wholesaler"]);
    const clearanceStatus = (session.user as Record<string, unknown>).clearanceStatus;
    if (clearanceStatus !== "approved") {
        throw new Error("Your account must be approved before managing import declarations.");
    }
    return session;
}

function getPostgresErrorCode(error: unknown, depth = 0): string {
    if (depth > 4 || typeof error !== "object" || error === null) return "unknown";
    if ("code" in error && typeof error.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)) {
        return error.code;
    }
    if ("cause" in error) return getPostgresErrorCode(error.cause, depth + 1);
    return "unknown";
}

// ---------------------------------------------------------------------------
// Declare Import — manufacturer or wholesaler declares expected goods
// ---------------------------------------------------------------------------

export async function declareImport(data: {
    productId: string;
    productionMaterialId?: string;
    expectedQuantity: number;
    customsRef?: string;
    originCountry?: string;
    supplier?: string;
    estimatedValue?: number;
    currency?: string;
    expectedReturnDate?: Date;
}) {
    const session = await requireApprovedImportTrader();
    const parsed = declareImportSchema.safeParse(data);
    if (!parsed.success) throw new Error("Import details are invalid. Check the quantity and declaration fields.");
    const input = parsed.data;

    // Verify product exists
    const [prod] = await db
        .select()
        .from(product)
        .where(eq(product.id, input.productId))
        .limit(1);

    if (!prod) {
        throw new Error("Product not found");
    }

    if (input.productionMaterialId) {
        if (session.user.role !== 'manufacturer') throw new Error('Only manufacturers can declare a confidential manufacturing material import.');
        const [material] = await db.select({ id: productionMaterial.id, unit: productionMaterial.unit })
            .from(productionMaterial)
            .where(and(eq(productionMaterial.id, input.productionMaterialId), eq(productionMaterial.manufacturerId, session.user.id)))
            .limit(1);
        if (!material) throw new Error('Manufacturing material not found for your business.');
        if (material.unit.trim().toLocaleLowerCase('en-US') !== prod.unit.trim().toLocaleLowerCase('en-US')) {
            throw new Error('The customs product unit must match the confidential material unit.');
        }
    }

    // Generate a unique declaration reference
    const refSuffix = crypto.randomUUID().slice(0, 8).toUpperCase();
    const declarationRef = `DECL-${refSuffix}`;

    const declaration = await db.transaction(async (tx) => {
        const [created] = await tx
            .insert(importDeclaration)
            .values({
                businessId: session.user.id,
                productId: input.productId,
                productionMaterialId: input.productionMaterialId ?? null,
                expectedQuantity: input.expectedQuantity,
                customsRef: input.customsRef || null,
                originCountry: input.originCountry || null,
                supplier: input.supplier || null,
                estimatedValue: input.estimatedValue ?? null,
                currency: input.currency || "USD",
                expectedReturnDate: input.expectedReturnDate ?? null,
                declarationRef,
                status: "pending",
            })
            .returning();

        await logAudit({
            userId: session.user.id,
            action: "IMPORT_DECLARED",
            targetType: "import_declaration",
            targetId: created.id,
            metadata: {
                declarationRef,
                productId: input.productId,
                productName: input.productionMaterialId ? '[protected manufacturing material]' : prod.name,
                productionMaterialId: input.productionMaterialId ?? null,
                expectedQuantity: input.expectedQuantity,
                customsRef: input.customsRef,
                originCountry: input.originCountry,
                supplier: input.supplier,
                estimatedValue: input.estimatedValue,
                currency: input.currency,
            },
        }, async (entry) => { await tx.insert(auditLog).values(entry); });

        return created;
    });

    return declaration;
}

// ---------------------------------------------------------------------------
// Submit Arrival — trader enters actual quantity + supporting documents
// Goes to status "submitted" — awaiting RRA confirmation
// ---------------------------------------------------------------------------

export async function submitImportArrival(
    declarationId: string,
    data: {
        actualQuantity: number;
        invoiceRef: string;
        supportingDoc: string;
    },
) {
    const session = await requireApprovedImportTrader();
    const parsedId = importDeclarationIdSchema.safeParse(declarationId);
    if (!parsedId.success) throw new Error("Import declaration not found.");
    const safeDeclarationId = parsedId.data;
    const parsed = submitImportArrivalSchema.safeParse(data);
    if (!parsed.success) throw new Error("Arrival details are invalid. Check the quantity, invoice reference, and PDF.");
    const input = parsed.data;
    const filename = input.supportingDoc.match(/^\/api\/import-invoice\/(.+)$/)?.[1];
    if (!filename || !isImportFilenameForDeclaration(filename, safeDeclarationId)) {
        throw new Error("The uploaded invoice is not associated with this declaration.");
    }
    try {
        await ensureImportDocumentExists(filename);
    } catch {
        throw new Error("The uploaded invoice could not be found. Please upload it again.");
    }

    // Get the declaration — must belong to this user
    await db.transaction(async (tx) => {
        const [declaration] = await tx
            .select()
            .from(importDeclaration)
            .where(and(eq(importDeclaration.id, safeDeclarationId), eq(importDeclaration.businessId, session.user.id)))
            .for("update")
            .limit(1);

        if (!declaration) throw new Error("Import declaration not found");
        if (declaration.status !== "pending") throw new Error("This declaration has already been submitted or processed");

        const [updated] = await tx
            .update(importDeclaration)
            .set({
                actualQuantity: input.actualQuantity,
                invoiceRef: input.invoiceRef,
                supportingDoc: input.supportingDoc,
                status: "submitted",
            })
            .where(and(eq(importDeclaration.id, safeDeclarationId), eq(importDeclaration.status, "pending")))
            .returning({ id: importDeclaration.id });
        if (!updated) throw new Error("Declaration status changed concurrently; arrival was not submitted.");

        await logAudit({
            userId: session.user.id,
            action: "IMPORT_ARRIVAL_SUBMITTED",
            targetType: "import_declaration",
            targetId: safeDeclarationId,
            metadata: {
                expectedQuantity: declaration.expectedQuantity,
                actualQuantity: input.actualQuantity,
                invoiceRef: input.invoiceRef,
            },
        }, async (entry) => { await tx.insert(auditLog).values(entry); });
    });

    return { success: true };
}

// ---------------------------------------------------------------------------
// RRA: Confirm Import — only RRA officer can approve, activating stock
// Uses a DB transaction with FOR UPDATE lock to prevent TOCTOU races (C2 fix)
// ---------------------------------------------------------------------------

export async function confirmImportArrival(
    declarationId: string,
    opts?: { inspectedQuantity?: number; reviewerNote?: string },
) {
    const { staff, ...session } = await requireRRASession("compliance_officer", "audit_officer", "customs_import_officer");
    const parsedId = importDeclarationIdSchema.safeParse(declarationId);
    if (!parsedId.success) throw new Error("Import declaration not found.");
    const safeDeclarationId = parsedId.data;
    const parsedOpts = confirmImportArrivalSchema.safeParse(opts ?? {});
    if (!parsedOpts.success) throw new Error("Inspection details are invalid. Quantity must be finite and positive.");
    const review = parsedOpts.data;

    let confirmation: {
        declaration: typeof importDeclaration.$inferSelect;
        quantityToActivate: number;
        discrepancy: number;
        confidentialMaterialReceipt: boolean;
    };
    let failureStage = "read submitted declaration";
    try {
        failureStage = "start database transaction";
        confirmation = await db.transaction(async (tx) => {
        failureStage = "load and lock declaration";
        // Lock the row for the duration of this transaction
        const [declaration] = await tx
            .select()
            .from(importDeclaration)
            .where(eq(importDeclaration.id, safeDeclarationId))
            .for("update")
            .limit(1);

        if (!declaration) throw new Error("Import declaration not found");
        failureStage = "validate declaration status";
        if (declaration.status !== "submitted") {
            throw new Error("Only submitted declarations can be confirmed. Current status: " + declaration.status);
        }
        if (declaration.productionMaterialId && !staff.clearanceRoles.some((role) => hasRRAPermission(role, 'production.material.receipt.review'))) {
            throw new Error('Confidential material imports require the dedicated material receipt review permission.');
        }
        failureStage = "validate arrival details";
        if (declaration.actualQuantity == null || !declaration.invoiceRef) {
            throw new Error("Declaration is missing arrival details / invoice reference");
        }

        // RRA officer may override with inspected quantity; fall back to trader-declared
        failureStage = "validate inspected quantity";
        const quantityToActivate = review.inspectedQuantity ?? declaration.actualQuantity;
        if (!Number.isFinite(quantityToActivate) || quantityToActivate <= 0 || quantityToActivate > 1_000_000_000) {
            throw new Error("Inspected quantity must be finite and between 0 and 1,000,000,000.");
        }
        const discrepancy = declaration.expectedQuantity - quantityToActivate;
        const discrepancyPct = declaration.expectedQuantity > 0
            ? Math.abs(discrepancy) / declaration.expectedQuantity * 100
            : 0;
        const discrepancyFlag = discrepancyPct > 10;

        // Atomic status check + update — prevents double-activation
        failureStage = "mark declaration approved";
        const [activated] = await tx
            .update(importDeclaration)
            .set({
                status: "activated",
                reviewedById: session.user.id,
                inspectedQuantity: quantityToActivate,
                reviewerNote: review.reviewerNote || null,
                discrepancyFlag,
                discrepancyPct,
            })
            .where(
                and(
                    eq(importDeclaration.id, safeDeclarationId),
                    eq(importDeclaration.status, "submitted"), // second guard
                ),
            )
            .returning({ id: importDeclaration.id });

        if (!activated) throw new Error("Declaration status changed concurrently; import was not activated.");

        if (declaration.productionMaterialId) {
            failureStage = "verify confidential material and unit";
            const [material] = await tx.select({ id: productionMaterial.id, manufacturerId: productionMaterial.manufacturerId, unit: productionMaterial.unit })
                .from(productionMaterial)
                .where(eq(productionMaterial.id, declaration.productionMaterialId))
                .for("update").limit(1);
            const [declaredProduct] = await tx.select({ unit: product.unit }).from(product)
                .where(eq(product.id, declaration.productId)).limit(1);
            if (!material || material.manufacturerId !== declaration.businessId || !declaredProduct
                || material.unit.trim().toLocaleLowerCase('en-US') !== declaredProduct.unit.trim().toLocaleLowerCase('en-US')) {
                throw new Error("Confidential material ownership or unit validation failed.");
            }
            const ledgerQuantity = microsToDecimal(quantityToMicros(quantityToActivate));
            const [receipt] = await tx.insert(productionMaterialReceipt).values({
                manufacturerId: declaration.businessId,
                materialId: material.id,
                origin: 'import',
                importDeclarationId: declaration.id,
                supplierReference: declaration.supplier,
                evidenceReference: [declaration.declarationRef ?? declaration.id, declaration.invoiceRef, declaration.customsRef].filter(Boolean).join(' · '),
                unit: material.unit,
                quantity: ledgerQuantity,
                status: 'verified',
                idempotencyKey: `import-declaration:${declaration.id}`,
                submittedByUserId: declaration.businessId,
                reviewedByUserId: session.user.id,
                reviewedAt: new Date(),
                reviewNote: review.reviewerNote || null,
            }).returning({ id: productionMaterialReceipt.id });
            if (!receipt) throw new Error('Confidential material receipt evidence could not be saved.');

            failureStage = "post inspected material receipt";
            const [balance] = await tx.select({ quantity: sql<string>`COALESCE(SUM(${productionMaterialMovement.quantityDelta}), 0)::text` })
                .from(productionMaterialMovement)
                .where(and(eq(productionMaterialMovement.manufacturerId, declaration.businessId), eq(productionMaterialMovement.materialId, material.id)));
            const before = decimalToMicros(balance?.quantity ?? '0');
            const delta = decimalToMicros(ledgerQuantity);
            await tx.insert(productionMaterialMovement).values({
                manufacturerId: declaration.businessId,
                materialId: material.id,
                movementType: 'receipt',
                quantityDelta: ledgerQuantity,
                quantityBefore: microsToDecimal(before),
                quantityAfter: microsToDecimal(before + delta),
                receiptId: receipt.id,
                sourceReference: declaration.id,
                actorUserId: session.user.id,
                reason: 'RRA-inspected import arrival verified',
            });
        } else {
            // Ordinary imported products continue to update only product stock.
            failureStage = "add inspected quantity to stock";
            await tx.insert(stock)
                .values({ businessId: declaration.businessId, productId: declaration.productId, quantity: quantityToActivate })
                .onConflictDoUpdate({
                    target: [stock.businessId, stock.productId],
                    set: { quantity: sql`${stock.quantity} + ${quantityToActivate}` },
                })
                .returning({ quantity: stock.quantity });
            failureStage = "verify updated stock quantity";
            const [updatedStock] = await tx.select({ quantity: stock.quantity })
                .from(stock)
                .where(and(eq(stock.businessId, declaration.businessId), eq(stock.productId, declaration.productId)))
                .for("update").limit(1);
            if (!updatedStock) throw new Error("Import stock activation could not be confirmed.");
            const quantityBefore = updatedStock.quantity - quantityToActivate;
            failureStage = "write stock movement";
            await tx.insert(stockMovement).values({
                businessId: declaration.businessId,
                productId: declaration.productId,
                quantityDelta: quantityToActivate,
                quantityBefore,
                quantityAfter: updatedStock.quantity,
                movementType: "import_receipt",
                sourceType: "import_declaration",
                sourceId: safeDeclarationId,
                actorUserId: session.user.id,
            });
        }

        failureStage = "write audit record";
        await tx.insert(auditLog).values({
            userId: session.user.id,
            action: "IMPORT_CONFIRMED_BY_RRA",
            targetType: "import_declaration",
            targetId: safeDeclarationId,
            metadata: JSON.stringify({
                expectedQuantity: declaration.expectedQuantity,
                traderDeclaredQuantity: declaration.actualQuantity,
                inspectedQuantity: quantityToActivate,
                discrepancy,
                discrepancyPct: Math.round(discrepancyPct),
                discrepancyFlag,
                confidentialMaterialReceipt: Boolean(declaration.productionMaterialId),
                materialId: declaration.productionMaterialId ?? null,
                reviewerNote: review.reviewerNote,
                reviewedBy: staff.staffId,
            }),
        });

            return { declaration, quantityToActivate, discrepancy, confidentialMaterialReceipt: Boolean(declaration.productionMaterialId) };
        });
    } catch (error) {
        const reference = crypto.randomUUID();
        const errorCode = getPostgresErrorCode(error);
        const safeValidationMessage = error instanceof Error ? [
            "Import declaration not found",
            "Only submitted declarations can be confirmed.",
            "Declaration is missing arrival details / invoice reference",
            "Inspected quantity must be finite and between 0 and 1,000,000,000.",
            "Declaration status changed concurrently; import was not activated.",
            "Import stock activation could not be confirmed.",
            "Confidential material imports require the dedicated material receipt review permission.",
            "Confidential material ownership or unit validation failed.",
        ].find((message) => error.message.startsWith(message)) : undefined;
        const errorType = error instanceof Error && /^[A-Za-z0-9_.-]{1,60}$/.test(error.name)
            ? error.name : "UnknownError";
        console.error("[confirmImportArrival] Transaction failed", {
            reference,
            failureStage,
            errorCode,
            errorType,
        });
        return {
            success: false as const,
            error: safeValidationMessage
                ? `Import confirmation failed: ${safeValidationMessage} Reference: ${reference}.`
                : `Import confirmation failed during ${failureStage}. Reference: ${reference} (error type: ${errorType}; database code: ${errorCode}).`,
        };
    }

    const { declaration, quantityToActivate, discrepancy, confidentialMaterialReceipt } = confirmation;

    // Notify the trader (outside transaction — non-critical)
    try {
        await createNotification({
            userId: declaration.businessId,
            type: "system",
            title: confidentialMaterialReceipt ? "Material Import Verified" : "Import Approved",
            message: confidentialMaterialReceipt
                ? `RRA verified ${quantityToActivate.toLocaleString()} units of your confidential manufacturing material. The quantity is available in your material ledger.`
                : `Your import declaration has been approved by RRA. ${quantityToActivate} units have been added to your stock.`,
            link: "/dashboard/imports",
        });
    } catch (error) {
        const reference = crypto.randomUUID();
        console.error("[confirmImportArrival] Notification failed after commit", {
            reference,
            message: error instanceof Error ? error.message.slice(0, 500) : "Unknown notification error",
        });
    }

    emitToUser(declaration.businessId, "import:confirmed", {
        declarationId: safeDeclarationId,
        quantityToActivate,
    });

    return {
        success: true as const,
        quantityToActivate,
        expectedQuantity: declaration.expectedQuantity,
        discrepancy,
    };
}

// ---------------------------------------------------------------------------
// RRA: Reject Import — uses DB transaction + FOR UPDATE lock (C2/TOCTOU fix)
// ---------------------------------------------------------------------------

export async function rejectImportArrival(
    declarationId: string,
    reason: string,
) {
    const { staff, ...session } = await requireRRASession("compliance_officer", "audit_officer", "customs_import_officer");
    const parsedId = importDeclarationIdSchema.safeParse(declarationId);
    if (!parsedId.success) throw new Error("Import declaration not found.");
    const safeDeclarationId = parsedId.data;

    const parsedReason = rejectImportArrivalSchema.safeParse(reason);
    if (!parsedReason.success) throw new Error("A rejection reason is required and must be 2,000 characters or fewer.");
    const safeReason = parsedReason.data;

    // Use a transaction with row-level lock to prevent TOCTOU race
    const declaration = await db.transaction(async (tx) => {
        const [declaration] = await tx
            .select()
            .from(importDeclaration)
            .where(eq(importDeclaration.id, safeDeclarationId))
            .for("update")
            .limit(1);

        if (!declaration) throw new Error("Import declaration not found");
        if (declaration.status !== "submitted") {
            throw new Error("Only submitted declarations can be rejected. Current status: " + declaration.status);
        }

        // Atomic status check + update
        const [rejected] = await tx
            .update(importDeclaration)
            .set({
                status: "rejected",
                reviewedById: session.user.id,
                reviewerNote: safeReason,
            })
            .where(
                and(
                    eq(importDeclaration.id, safeDeclarationId),
                    eq(importDeclaration.status, "submitted"), // double guard
                ),
            )
            .returning({ id: importDeclaration.id });

        if (!rejected) throw new Error("Declaration status changed concurrently; was not rejected.");

        await tx.insert(auditLog).values({
            userId: session.user.id,
            action: "IMPORT_REJECTED_BY_RRA",
            targetType: "import_declaration",
            targetId: safeDeclarationId,
            metadata: JSON.stringify({
                reason: safeReason,
                rejectedBy: staff.staffId,
            }),
        });

        return declaration;
    });

    // Notify trader (outside transaction — non-critical)
    await createNotification({
        userId: declaration.businessId,
        type: "compliance_alert",
        title: "Import Rejected",
        message: `Your import declaration was rejected by RRA. Reason: ${safeReason}`,
        link: "/dashboard/imports",
    });

    emitToUser(declaration.businessId, "import:rejected", {
        declarationId: safeDeclarationId,
        reason: safeReason,
    });

    return { success: true };
}

// ---------------------------------------------------------------------------
// Get Import Declarations (trader's own)
// ---------------------------------------------------------------------------

export async function getImportDeclarations() {
    const session = await requireTraderSession(["manufacturer", "wholesaler"]);

    return db
        .select({
            id: importDeclaration.id,
            declarationRef: importDeclaration.declarationRef,
            productId: importDeclaration.productId,
            productName: sql<string>`CASE WHEN ${importDeclaration.productionMaterialId} IS NOT NULL THEN COALESCE(${productionMaterial.confidentialName}, 'Manufacturing material') ELSE ${product.name} END`,
            productionMaterialId: importDeclaration.productionMaterialId,
            isProductionMaterial: sql<boolean>`${importDeclaration.productionMaterialId} IS NOT NULL`,
            productUnit: product.unit,
            expectedQuantity: importDeclaration.expectedQuantity,
            actualQuantity: importDeclaration.actualQuantity,
            inspectedQuantity: importDeclaration.inspectedQuantity,
            status: importDeclaration.status,
            customsRef: importDeclaration.customsRef,
            originCountry: importDeclaration.originCountry,
            supplier: importDeclaration.supplier,
            estimatedValue: importDeclaration.estimatedValue,
            currency: importDeclaration.currency,
            expectedReturnDate: importDeclaration.expectedReturnDate,
            invoiceRef: importDeclaration.invoiceRef,
            supportingDoc: importDeclaration.supportingDoc,
            discrepancyFlag: importDeclaration.discrepancyFlag,
            discrepancyPct: importDeclaration.discrepancyPct,
            reviewerNote: importDeclaration.reviewerNote,
            createdAt: importDeclaration.createdAt,
        })
        .from(importDeclaration)
        .innerJoin(product, eq(importDeclaration.productId, product.id))
        .leftJoin(productionMaterial, eq(importDeclaration.productionMaterialId, productionMaterial.id))
        .where(eq(importDeclaration.businessId, session.user.id))
        .orderBy(desc(importDeclaration.createdAt));
}

// ---------------------------------------------------------------------------
// Get single declaration (trader)
// ---------------------------------------------------------------------------

export async function getImportDeclaration(declarationId: string) {
    const session = await requireTraderSession(["manufacturer", "wholesaler"]);
    const parsedId = importDeclarationIdSchema.safeParse(declarationId);
    if (!parsedId.success) throw new Error("Declaration not found");

    const [declaration] = await db
        .select({
            id: importDeclaration.id,
            declarationRef: importDeclaration.declarationRef,
            productId: importDeclaration.productId,
            productName: sql<string>`CASE WHEN ${importDeclaration.productionMaterialId} IS NOT NULL THEN COALESCE(${productionMaterial.confidentialName}, 'Manufacturing material') ELSE ${product.name} END`,
            productionMaterialId: importDeclaration.productionMaterialId,
            isProductionMaterial: sql<boolean>`${importDeclaration.productionMaterialId} IS NOT NULL`,
            productUnit: product.unit,
            expectedQuantity: importDeclaration.expectedQuantity,
            actualQuantity: importDeclaration.actualQuantity,
            inspectedQuantity: importDeclaration.inspectedQuantity,
            status: importDeclaration.status,
            customsRef: importDeclaration.customsRef,
            originCountry: importDeclaration.originCountry,
            supplier: importDeclaration.supplier,
            estimatedValue: importDeclaration.estimatedValue,
            currency: importDeclaration.currency,
            expectedReturnDate: importDeclaration.expectedReturnDate,
            invoiceRef: importDeclaration.invoiceRef,
            supportingDoc: importDeclaration.supportingDoc,
            discrepancyFlag: importDeclaration.discrepancyFlag,
            discrepancyPct: importDeclaration.discrepancyPct,
            reviewerNote: importDeclaration.reviewerNote,
            createdAt: importDeclaration.createdAt,
        })
        .from(importDeclaration)
        .innerJoin(product, eq(importDeclaration.productId, product.id))
        .leftJoin(productionMaterial, eq(importDeclaration.productionMaterialId, productionMaterial.id))
        .where(
            and(
                eq(importDeclaration.id, parsedId.data),
                eq(importDeclaration.businessId, session.user.id),
            ),
        )
        .limit(1);

    if (!declaration) {
        throw new Error("Declaration not found");
    }

    return declaration;
}

// ---------------------------------------------------------------------------
// RRA: Get all import declarations — filtered at DB level (C3 fix)
// ---------------------------------------------------------------------------

export async function getAllImportDeclarations(statusFilter?: string) {
    const session = await requireRRASession("compliance_officer", "audit_officer", "customs_import_officer");
    const canReviewMaterials = session.staff.clearanceRoles.some((role) => hasRRAPermission(role, 'production.material.receipt.review'));

    // Build where clause at DB level instead of JS post-filter
    const whereClause = statusFilter
        ? and(eq(importDeclaration.status, statusFilter))
        : undefined;

    const rows = await db
        .select({
            id: importDeclaration.id,
            declarationRef: importDeclaration.declarationRef,
            productName: sql<string>`CASE WHEN ${importDeclaration.productionMaterialId} IS NOT NULL THEN 'Confidential manufacturing material' ELSE ${product.name} END`,
            materialCode: productionMaterial.materialCode,
            isProductionMaterial: sql<boolean>`${importDeclaration.productionMaterialId} IS NOT NULL`,
            productUnit: product.unit,
            expectedQuantity: importDeclaration.expectedQuantity,
            actualQuantity: importDeclaration.actualQuantity,
            inspectedQuantity: importDeclaration.inspectedQuantity,
            status: importDeclaration.status,
            customsRef: importDeclaration.customsRef,
            originCountry: importDeclaration.originCountry,
            supplier: importDeclaration.supplier,
            estimatedValue: importDeclaration.estimatedValue,
            currency: importDeclaration.currency,
            invoiceRef: importDeclaration.invoiceRef,
            supportingDoc: importDeclaration.supportingDoc,
            discrepancyFlag: importDeclaration.discrepancyFlag,
            discrepancyPct: importDeclaration.discrepancyPct,
            reviewerNote: importDeclaration.reviewerNote,
            createdAt: importDeclaration.createdAt,
            businessName: user.businessName,
            tinNumber: user.tinNumber,
        })
        .from(importDeclaration)
        .innerJoin(product, eq(importDeclaration.productId, product.id))
        .leftJoin(productionMaterial, eq(importDeclaration.productionMaterialId, productionMaterial.id))
        .innerJoin(user, eq(importDeclaration.businessId, user.id))
        .where(whereClause)
        .orderBy(desc(importDeclaration.createdAt));
    return rows.map((row) => ({ ...row, materialCode: canReviewMaterials ? row.materialCode : null }));
}
