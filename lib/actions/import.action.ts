"use server";

import { eq, desc, and, sql } from "drizzle-orm";
import db from "@/db/drizzle";
import { importDeclaration, product, stock, user, auditLog } from "@/db/schema";
import { requireTraderSession, requireRRASession } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { emitToUser } from "@/lib/realtime";

// ---------------------------------------------------------------------------
// Declare Import — manufacturer or wholesaler declares expected goods
// ---------------------------------------------------------------------------

export async function declareImport(data: {
    productId: string;
    expectedQuantity: number;
    customsRef?: string;
    originCountry?: string;
    supplier?: string;
    estimatedValue?: number;
    currency?: string;
    expectedReturnDate?: Date;
}) {
    const session = await requireTraderSession(["manufacturer", "wholesaler"]);

    if (data.expectedQuantity <= 0) {
        throw new Error("Expected quantity must be positive");
    }

    // Verify product exists
    const [prod] = await db
        .select()
        .from(product)
        .where(eq(product.id, data.productId))
        .limit(1);

    if (!prod) {
        throw new Error("Product not found");
    }

    // Generate a unique declaration reference
    const refSuffix = crypto.randomUUID().slice(0, 8).toUpperCase();
    const declarationRef = `DECL-${refSuffix}`;

    const [declaration] = await db
        .insert(importDeclaration)
        .values({
            businessId: session.user.id,
            productId: data.productId,
            expectedQuantity: data.expectedQuantity,
            customsRef: data.customsRef?.trim() || null,
            originCountry: data.originCountry?.trim() || null,
            supplier: data.supplier?.trim() || null,
            estimatedValue: data.estimatedValue ?? null,
            currency: data.currency?.trim() || "USD",
            expectedReturnDate: data.expectedReturnDate ?? null,
            declarationRef,
            status: "pending",
        })
        .returning();

    await logAudit({
        userId: session.user.id,
        action: "IMPORT_DECLARED",
        targetType: "import_declaration",
        targetId: declaration.id,
        metadata: {
            declarationRef,
            productId: data.productId,
            productName: prod.name,
            expectedQuantity: data.expectedQuantity,
            customsRef: data.customsRef,
            originCountry: data.originCountry,
            supplier: data.supplier,
            estimatedValue: data.estimatedValue,
            currency: data.currency,
        },
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
    const session = await requireTraderSession(["manufacturer", "wholesaler"]);

    if (data.actualQuantity <= 0) {
        throw new Error("Actual quantity must be positive");
    }

    if (!data.invoiceRef?.trim()) {
        throw new Error("Invoice / import document reference is required");
    }

    if (!data.supportingDoc?.trim()) {
        throw new Error("Supporting document description is required");
    }

    // Get the declaration — must belong to this user
    const [declaration] = await db
        .select()
        .from(importDeclaration)
        .where(
            and(
                eq(importDeclaration.id, declarationId),
                eq(importDeclaration.businessId, session.user.id),
            ),
        )
        .limit(1);

    if (!declaration) {
        throw new Error("Import declaration not found");
    }

    if (declaration.status !== "pending") {
        throw new Error("This declaration has already been submitted or processed");
    }

    // Update to "submitted" — awaiting RRA review
    await db
        .update(importDeclaration)
        .set({
            actualQuantity: data.actualQuantity,
            invoiceRef: data.invoiceRef.trim(),
            supportingDoc: data.supportingDoc.trim(),
            status: "submitted",
        })
        .where(eq(importDeclaration.id, declarationId));

    await logAudit({
        userId: session.user.id,
        action: "IMPORT_ARRIVAL_SUBMITTED",
        targetType: "import_declaration",
        targetId: declarationId,
        metadata: {
            expectedQuantity: declaration.expectedQuantity,
            actualQuantity: data.actualQuantity,
            invoiceRef: data.invoiceRef.trim(),
        },
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
    const { staff, ...session } = await requireRRASession("compliance_officer", "audit_officer");

    const { declaration, quantityToActivate, discrepancy } = await db.transaction(async (tx) => {
        // Lock the row for the duration of this transaction
        const [declaration] = await tx
            .select()
            .from(importDeclaration)
            .where(eq(importDeclaration.id, declarationId))
            .for("update")
            .limit(1);

        if (!declaration) throw new Error("Import declaration not found");
        if (declaration.status !== "submitted") {
            throw new Error("Only submitted declarations can be confirmed. Current status: " + declaration.status);
        }
        if (declaration.actualQuantity == null || !declaration.invoiceRef) {
            throw new Error("Declaration is missing arrival details / invoice reference");
        }

        // RRA officer may override with inspected quantity; fall back to trader-declared
        const quantityToActivate = opts?.inspectedQuantity ?? declaration.actualQuantity;
        const discrepancy = declaration.expectedQuantity - quantityToActivate;
        const discrepancyPct = declaration.expectedQuantity > 0
            ? Math.abs(discrepancy) / declaration.expectedQuantity * 100
            : 0;
        const discrepancyFlag = discrepancyPct > 10;

        // Atomic status check + update — prevents double-activation
        const [activated] = await tx
            .update(importDeclaration)
            .set({
                status: "activated",
                reviewedById: session.user.id,
                inspectedQuantity: quantityToActivate,
                reviewerNote: opts?.reviewerNote?.trim() || null,
                discrepancyFlag,
                discrepancyPct,
            })
            .where(
                and(
                    eq(importDeclaration.id, declarationId),
                    eq(importDeclaration.status, "submitted"), // second guard
                ),
            )
            .returning({ id: importDeclaration.id });

        if (!activated) throw new Error("Declaration status changed concurrently; import was not activated.");

        // Add inspected quantity to stock (upsert within same transaction)
        await tx
            .insert(stock)
            .values({
                businessId: declaration.businessId,
                productId: declaration.productId,
                quantity: quantityToActivate,
            })
            .onConflictDoUpdate({
                target: [stock.businessId, stock.productId],
                set: { quantity: sql`${stock.quantity} + ${quantityToActivate}` },
            });

        await tx.insert(auditLog).values({
            userId: session.user.id,
            action: "IMPORT_CONFIRMED_BY_RRA",
            targetType: "import_declaration",
            targetId: declarationId,
            metadata: JSON.stringify({
                expectedQuantity: declaration.expectedQuantity,
                traderDeclaredQuantity: declaration.actualQuantity,
                inspectedQuantity: quantityToActivate,
                discrepancy,
                discrepancyPct: Math.round(discrepancyPct),
                discrepancyFlag,
                reviewerNote: opts?.reviewerNote,
                reviewedBy: staff.staffId,
            }),
        });

        return { declaration, quantityToActivate, discrepancy };
    });

    // Notify the trader (outside transaction — non-critical)
    await createNotification({
        userId: declaration.businessId,
        type: "system",
        title: "Import Approved",
        message: `Your import declaration has been approved by RRA. ${quantityToActivate} units have been added to your stock.`,
        link: "/dashboard/imports",
    });

    emitToUser(declaration.businessId, "import:confirmed", {
        declarationId,
        quantityToActivate,
    });

    return {
        success: true,
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
    const { staff, ...session } = await requireRRASession("compliance_officer", "audit_officer");

    if (!reason?.trim()) {
        throw new Error("A reason is required for rejection");
    }

    // Use a transaction with row-level lock to prevent TOCTOU race
    const declaration = await db.transaction(async (tx) => {
        const [declaration] = await tx
            .select()
            .from(importDeclaration)
            .where(eq(importDeclaration.id, declarationId))
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
                reviewerNote: reason.trim(),
            })
            .where(
                and(
                    eq(importDeclaration.id, declarationId),
                    eq(importDeclaration.status, "submitted"), // double guard
                ),
            )
            .returning({ id: importDeclaration.id });

        if (!rejected) throw new Error("Declaration status changed concurrently; was not rejected.");

        await tx.insert(auditLog).values({
            userId: session.user.id,
            action: "IMPORT_REJECTED_BY_RRA",
            targetType: "import_declaration",
            targetId: declarationId,
            metadata: JSON.stringify({
                reason: reason.trim(),
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
        message: `Your import declaration was rejected by RRA. Reason: ${reason.trim()}`,
        link: "/dashboard/imports",
    });

    emitToUser(declaration.businessId, "import:rejected", {
        declarationId,
        reason: reason.trim(),
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
            productName: product.name,
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
        .where(eq(importDeclaration.businessId, session.user.id))
        .orderBy(desc(importDeclaration.createdAt));
}

// ---------------------------------------------------------------------------
// Get single declaration (trader)
// ---------------------------------------------------------------------------

export async function getImportDeclaration(declarationId: string) {
    const session = await requireTraderSession(["manufacturer", "wholesaler"]);

    const [declaration] = await db
        .select({
            id: importDeclaration.id,
            declarationRef: importDeclaration.declarationRef,
            productId: importDeclaration.productId,
            productName: product.name,
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
        .where(
            and(
                eq(importDeclaration.id, declarationId),
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
    await requireRRASession("compliance_officer", "audit_officer");

    // Build where clause at DB level instead of JS post-filter
    const whereClause = statusFilter
        ? and(eq(importDeclaration.status, statusFilter))
        : undefined;

    return db
        .select({
            id: importDeclaration.id,
            declarationRef: importDeclaration.declarationRef,
            productName: product.name,
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
        .innerJoin(user, eq(importDeclaration.businessId, user.id))
        .where(whereClause)
        .orderBy(desc(importDeclaration.createdAt));
}