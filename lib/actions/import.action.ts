"use server";

import { eq, desc, and } from "drizzle-orm";
import db from "@/db/drizzle";
import { importDeclaration, product, stock, user } from "@/db/schema";
import { requireTraderSession, requireRRASession } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/actions/notification.action";
import { emitToUser } from "@/lib/realtime";

// ---------------------------------------------------------------------------
// Declare Import — manufacturer or wholesaler declares expected goods
// ---------------------------------------------------------------------------

export async function declareImport(data: {
    productId: string;
    expectedQuantity: number;
    customsRef?: string;
    originCountry?: string;
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

    const [declaration] = await db
        .insert(importDeclaration)
        .values({
            businessId: session.user.id,
            productId: data.productId,
            expectedQuantity: data.expectedQuantity,
            customsRef: data.customsRef?.trim() || null,
            originCountry: data.originCountry?.trim() || null,
            status: "pending",
        })
        .returning();

    await logAudit({
        userId: session.user.id,
        action: "IMPORT_DECLARED",
        targetType: "import_declaration",
        targetId: declaration.id,
        metadata: {
            productId: data.productId,
            productName: prod.name,
            expectedQuantity: data.expectedQuantity,
            customsRef: data.customsRef,
            originCountry: data.originCountry,
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
// ---------------------------------------------------------------------------

export async function confirmImportArrival(declarationId: string) {
    const { staff, ...session } = await requireRRASession("compliance_officer", "audit_officer");

    const [declaration] = await db
        .select()
        .from(importDeclaration)
        .where(eq(importDeclaration.id, declarationId))
        .limit(1);

    if (!declaration) {
        throw new Error("Import declaration not found");
    }

    if (declaration.status !== "submitted") {
        throw new Error("Only submitted declarations can be confirmed. Current status: " + declaration.status);
    }

    if (!declaration.actualQuantity || !declaration.invoiceRef) {
        throw new Error("Declaration is missing arrival details / invoice reference");
    }

    const actualQuantity = declaration.actualQuantity;

    // Update status to activated + record reviewer
    await db
        .update(importDeclaration)
        .set({
            status: "activated",
            reviewedById: session.user.id,
        })
        .where(eq(importDeclaration.id, declarationId));

    // Add to stock (upsert)
    const [existingStock] = await db
        .select()
        .from(stock)
        .where(
            and(
                eq(stock.businessId, declaration.businessId),
                eq(stock.productId, declaration.productId),
            ),
        )
        .limit(1);

    if (existingStock) {
        await db
            .update(stock)
            .set({ quantity: existingStock.quantity + actualQuantity })
            .where(eq(stock.id, existingStock.id));
    } else {
        await db.insert(stock).values({
            businessId: declaration.businessId,
            productId: declaration.productId,
            quantity: actualQuantity,
        });
    }

    // Flag discrepancy in audit
    const discrepancy = declaration.expectedQuantity - actualQuantity;
    const discrepancyPct =
        Math.abs(discrepancy) / declaration.expectedQuantity;

    await logAudit({
        userId: session.user.id,
        action: "IMPORT_CONFIRMED_BY_RRA",
        targetType: "import_declaration",
        targetId: declarationId,
        metadata: {
            expectedQuantity: declaration.expectedQuantity,
            actualQuantity,
            discrepancy,
            discrepancyPct: Math.round(discrepancyPct * 100),
            underDeclared: discrepancyPct > 0.1,
            reviewedBy: staff.staffId,
        },
    });

    // Notify the trader
    await createNotification({
        userId: declaration.businessId,
        type: "system",
        title: "Import Approved",
        message: `Your import declaration has been approved by RRA. ${actualQuantity} units have been added to your stock.`,
        link: "/dashboard/imports",
    });

    emitToUser(declaration.businessId, "import:confirmed", {
        declarationId,
        actualQuantity,
    });

    return {
        success: true,
        actualQuantity,
        expectedQuantity: declaration.expectedQuantity,
        discrepancy,
    };
}

// ---------------------------------------------------------------------------
// RRA: Reject Import
// ---------------------------------------------------------------------------

export async function rejectImportArrival(
    declarationId: string,
    reason: string,
) {
    const { staff, ...session } = await requireRRASession("compliance_officer", "audit_officer");

    if (!reason?.trim()) {
        throw new Error("A reason is required for rejection");
    }

    const [declaration] = await db
        .select()
        .from(importDeclaration)
        .where(eq(importDeclaration.id, declarationId))
        .limit(1);

    if (!declaration) {
        throw new Error("Import declaration not found");
    }

    if (declaration.status !== "submitted") {
        throw new Error("Only submitted declarations can be rejected");
    }

    await db
        .update(importDeclaration)
        .set({
            status: "rejected",
            reviewedById: session.user.id,
        })
        .where(eq(importDeclaration.id, declarationId));

    await logAudit({
        userId: session.user.id,
        action: "IMPORT_REJECTED_BY_RRA",
        targetType: "import_declaration",
        targetId: declarationId,
        metadata: {
            reason: reason.trim(),
            rejectedBy: staff.staffId,
        },
    });

    // Notify the trader
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
            productId: importDeclaration.productId,
            productName: product.name,
            productUnit: product.unit,
            expectedQuantity: importDeclaration.expectedQuantity,
            actualQuantity: importDeclaration.actualQuantity,
            status: importDeclaration.status,
            customsRef: importDeclaration.customsRef,
            originCountry: importDeclaration.originCountry,
            invoiceRef: importDeclaration.invoiceRef,
            supportingDoc: importDeclaration.supportingDoc,
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
            productId: importDeclaration.productId,
            productName: product.name,
            productUnit: product.unit,
            expectedQuantity: importDeclaration.expectedQuantity,
            actualQuantity: importDeclaration.actualQuantity,
            status: importDeclaration.status,
            customsRef: importDeclaration.customsRef,
            originCountry: importDeclaration.originCountry,
            invoiceRef: importDeclaration.invoiceRef,
            supportingDoc: importDeclaration.supportingDoc,
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
// RRA: Get all import declarations (admin view)
// ---------------------------------------------------------------------------

export async function getAllImportDeclarations(statusFilter?: string) {
    await requireRRASession("compliance_officer", "audit_officer");

    const result = await db
        .select({
            id: importDeclaration.id,
            productName: product.name,
            productUnit: product.unit,
            expectedQuantity: importDeclaration.expectedQuantity,
            actualQuantity: importDeclaration.actualQuantity,
            status: importDeclaration.status,
            customsRef: importDeclaration.customsRef,
            originCountry: importDeclaration.originCountry,
            invoiceRef: importDeclaration.invoiceRef,
            supportingDoc: importDeclaration.supportingDoc,
            createdAt: importDeclaration.createdAt,
            businessName: user.businessName,
            tinNumber: user.tinNumber,
        })
        .from(importDeclaration)
        .innerJoin(product, eq(importDeclaration.productId, product.id))
        .innerJoin(user, eq(importDeclaration.businessId, user.id))
        .orderBy(desc(importDeclaration.createdAt));

    if (statusFilter) {
        return result.filter((d) => d.status === statusFilter);
    }

    return result;
}
