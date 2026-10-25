"use server";

import { eq, desc, and, or, sql, gte, inArray } from "drizzle-orm";
import db from "@/db/drizzle";
import { auditLog, dispute, notification, product, stock, stockMovement, transaction, user, vatRecord } from "@/db/schema";
import { requireTraderSession, requireRRAOperationalPermission } from "@/lib/auth-guard";
import { emitToUser } from "@/lib/realtime";
import { getSystemConfig } from "@/lib/actions/system-config.action";

const DISPUTE_WINDOW_HOURS = 48;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateRefNumber(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let ref = "DSP-";
    for (let i = 0; i < 8; i++) {
        ref += chars[Math.floor(Math.random() * chars.length)];
    }
    return ref;
}

/** Return transactions the current trader can actually dispute. */
export async function getDisputableTransactions() {
    const session = await requireTraderSession();
    const disputeCutoff = new Date(Date.now() - DISPUTE_WINDOW_HOURS * 60 * 60 * 1000);

    const transactions = await db
        .select({
            id: transaction.id,
            productName: product.name,
            quantity: transaction.quantity,
            totalAmount: transaction.totalAmount,
            createdAt: transaction.createdAt,
        })
        .from(transaction)
        .innerJoin(product, eq(transaction.productId, product.id))
        .where(and(
            or(eq(transaction.sellerId, session.user.id), eq(transaction.buyerId, session.user.id)),
            inArray(transaction.status, ["confirmed", "completed"]),
            gte(transaction.confirmedAt, disputeCutoff),
        ))
        .orderBy(desc(transaction.createdAt));

    if (transactions.length === 0) return [];

    const transactionIds = transactions.map(({ id }) => id);
    const [activeDisputes, vatRecords] = await Promise.all([
        db.select({ transactionId: dispute.transactionId })
            .from(dispute)
            .where(and(
                inArray(dispute.transactionId, transactionIds),
                sql`${dispute.status} NOT IN ('resolved', 'dismissed')`,
            )),
        db.select({ transactionId: vatRecord.transactionId })
            .from(vatRecord)
            .where(and(
                inArray(vatRecord.transactionId, transactionIds),
                eq(vatRecord.businessId, session.user.id),
            )),
    ]);

    const disputedIds = new Set(activeDisputes.map(({ transactionId }) => transactionId));
    const transactionsWithVat = new Set(vatRecords.map(({ transactionId }) => transactionId));
    return transactions
        .filter(({ id }) => !disputedIds.has(id) && transactionsWithVat.has(id))
        .map((txn) => ({
            ...txn,
            totalAmount: Number(txn.totalAmount),
            createdAt: txn.createdAt.toISOString(),
        }));
}

// ---------------------------------------------------------------------------
// 1. File a dispute (trader)
//    Party A files → counterparty (Party B) must acknowledge/contest
// ---------------------------------------------------------------------------

export async function fileDispute(data: {
    transactionId: string;
    reason: string;
    evidence?: string;
}) {
    const session = await requireTraderSession();

    if (!data.reason?.trim()) {
        throw new Error("A reason is required to file a dispute");
    }

    const referenceNumber = generateRefNumber();
    const { newDispute, counterpartyId } = await db.transaction(async (tx) => {
        const [txn] = await tx
            .select()
            .from(transaction)
            .where(eq(transaction.id, data.transactionId))
            .for("update")
            .limit(1);

        if (!txn || (txn.sellerId !== session.user.id && txn.buyerId !== session.user.id)) {
            throw new Error("Transaction not found or you are not a party");
        }
        if (txn.status !== "confirmed" && txn.status !== "completed") {
            throw new Error("Only confirmed/completed transactions can be disputed");
        }

        const confirmedAt = txn.confirmedAt;
        if (!confirmedAt || Date.now() - confirmedAt.getTime() > DISPUTE_WINDOW_HOURS * 60 * 60 * 1000) {
            throw new Error(`Disputes must be filed within ${DISPUTE_WINDOW_HOURS} hours of confirmation.`);
        }

        const [existing] = await tx
            .select({ id: dispute.id })
            .from(dispute)
            .where(and(eq(dispute.transactionId, data.transactionId), sql`${dispute.status} NOT IN ('resolved', 'dismissed')`))
            .limit(1);
        if (existing) throw new Error("An active dispute already exists for this transaction");

        const counterpartyId = txn.sellerId === session.user.id ? txn.buyerId : txn.sellerId;
        if (!counterpartyId) throw new Error("Cannot file a dispute without a counterparty");

        const [newDispute] = await tx
            .insert(dispute)
            .values({
                transactionId: data.transactionId,
                filedById: session.user.id,
                counterpartyId,
                referenceNumber,
                reason: data.reason.trim(),
                evidence: data.evidence?.trim() || null,
                status: "filed",
                counterpartyResponse: "pending",
            })
            .returning();

        const frozenRecords = await tx.update(vatRecord)
            .set({ isFrozen: true })
            .where(eq(vatRecord.transactionId, data.transactionId))
            .returning({ id: vatRecord.id });
        if (frozenRecords.length === 0) {
            throw new Error("Transaction VAT records are missing; dispute tax cannot be frozen.");
        }

        await tx.insert(auditLog).values({
            userId: session.user.id,
            action: "DISPUTE_FILED",
            targetType: "dispute",
            targetId: newDispute.id,
            metadata: JSON.stringify({
                transactionId: data.transactionId,
                referenceNumber,
                counterpartyId,
                reason: data.reason.trim(),
                frozenVatRecordCount: frozenRecords.length,
            }),
        });

        await tx.insert(notification).values({
            userId: counterpartyId,
            type: "system",
            title: "Dispute Filed Against You",
            message: `A dispute (${referenceNumber}) has been filed on a transaction you were part of. You must acknowledge or contest this dispute.`,
            link: "/dashboard/disputes",
        });

        return { newDispute, counterpartyId };
    });

    emitToUser(counterpartyId, "dispute:filed", {
        disputeId: newDispute.id,
        referenceNumber,
    });

    return newDispute;
}

// ---------------------------------------------------------------------------
// 2. Acknowledge dispute (counterparty confirms dispute exists)
//    Both parties now agree → escalated to RRA for review
// ---------------------------------------------------------------------------

export async function acknowledgeDispute(
    disputeId: string,
    note?: string,
) {
    const session = await requireTraderSession();

    const d = await db.transaction(async (tx) => {
        const [d] = await tx
            .select()
            .from(dispute)
            .where(and(eq(dispute.id, disputeId), eq(dispute.counterpartyId, session.user.id)))
            .for("update")
            .limit(1);
        if (!d) throw new Error("Dispute not found or you are not the counterparty");
        if (d.counterpartyResponse !== "pending") throw new Error("You have already responded to this dispute");

        const [updated] = await tx.update(dispute)
            .set({ counterpartyResponse: "acknowledged", counterpartyNote: note?.trim() || null, status: "under_review" })
            .where(and(eq(dispute.id, disputeId), eq(dispute.counterpartyResponse, "pending")))
            .returning({ id: dispute.id });
        if (!updated) throw new Error("Dispute response was already recorded");

        await tx.insert(auditLog).values({
            userId: session.user.id,
            action: "DISPUTE_ACKNOWLEDGED",
            targetType: "dispute",
            targetId: disputeId,
            metadata: JSON.stringify({ referenceNumber: d.referenceNumber, note: note?.trim() }),
        });
        await tx.insert(notification).values({
            userId: d.filedById,
            type: "system",
            title: "Dispute Acknowledged",
            message: `The counterparty has acknowledged dispute ${d.referenceNumber}. It has been escalated to RRA for review.`,
            link: "/dashboard/disputes",
        });
        return d;
    });

    emitToUser(d.filedById, "dispute:acknowledged", {
        disputeId,
        referenceNumber: d.referenceNumber,
    });

    return { success: true };
}

// ---------------------------------------------------------------------------
// 3. Contest dispute (counterparty denies the dispute)
//    Still escalated to RRA but marked as contested
// ---------------------------------------------------------------------------

export async function contestDispute(
    disputeId: string,
    note: string,
) {
    const session = await requireTraderSession();

    if (!note?.trim()) {
        throw new Error("A note explaining your position is required when contesting");
    }

    const d = await db.transaction(async (tx) => {
        const [d] = await tx
            .select()
            .from(dispute)
            .where(and(eq(dispute.id, disputeId), eq(dispute.counterpartyId, session.user.id)))
            .for("update")
            .limit(1);
        if (!d) throw new Error("Dispute not found or you are not the counterparty");
        if (d.counterpartyResponse !== "pending") throw new Error("You have already responded to this dispute");

        const [updated] = await tx.update(dispute)
            .set({ counterpartyResponse: "contested", counterpartyNote: note.trim(), status: "under_review" })
            .where(and(eq(dispute.id, disputeId), eq(dispute.counterpartyResponse, "pending")))
            .returning({ id: dispute.id });
        if (!updated) throw new Error("Dispute response was already recorded");

        await tx.insert(auditLog).values({
            userId: session.user.id,
            action: "DISPUTE_CONTESTED",
            targetType: "dispute",
            targetId: disputeId,
            metadata: JSON.stringify({ referenceNumber: d.referenceNumber, note: note.trim() }),
        });
        await tx.insert(notification).values({
            userId: d.filedById,
            type: "system",
            title: "Dispute Contested",
            message: `The counterparty has contested dispute ${d.referenceNumber}. It has been escalated to RRA for review.`,
            link: "/dashboard/disputes",
        });
        return d;
    });

    emitToUser(d.filedById, "dispute:contested", {
        disputeId,
        referenceNumber: d.referenceNumber,
    });

    return { success: true };
}

// ---------------------------------------------------------------------------
// 4. Get disputes (trader — filed by them OR against them)
// ---------------------------------------------------------------------------

export async function getDisputes() {
    const session = await requireTraderSession();

    const filedByUser = user;

    const results = await db
        .select({
            id: dispute.id,
            referenceNumber: dispute.referenceNumber,
            reason: dispute.reason,
            evidence: dispute.evidence,
            status: dispute.status,
            counterpartyResponse: dispute.counterpartyResponse,
            counterpartyNote: dispute.counterpartyNote,
            rraAction: dispute.rraAction,
            resolution: dispute.resolution,
            rraOfficialNote: dispute.rraOfficialNote,
            createdAt: dispute.createdAt,
            transactionId: dispute.transactionId,
            filedById: dispute.filedById,
            counterpartyId: dispute.counterpartyId,
        })
        .from(dispute)
        .where(
            or(
                eq(dispute.filedById, session.user.id),
                eq(dispute.counterpartyId, session.user.id),
            ),
        )
        .orderBy(desc(dispute.createdAt));

    // Annotate with role
    return results.map((d) => ({
        ...d,
        myRole: d.filedById === session.user.id ? "filer" as const : "counterparty" as const,
    }));
}

// ---------------------------------------------------------------------------
// 5. Get all disputes (admin view)
// ---------------------------------------------------------------------------

export async function getAllDisputes(tin?: string) {
    await requireRRAOperationalPermission("investigation.case.manage");

    // We need filer and counterparty names — use subqueries
    const filer = db
        .select({
            id: user.id,
            name: user.businessName,
            tin: user.tinNumber,
        })
        .from(user)
        .as("filer");

    const counterparty = db
        .select({
            id: user.id,
            name: user.businessName,
            tin: user.tinNumber,
        })
        .from(user)
        .as("counterparty");

    if (tin && (tin.trim().length < 5 || tin.trim().length > 32 || !/^[A-Za-z0-9-]+$/.test(tin.trim()))) {
        throw new Error("Enter a valid TIN to filter disputes.");
    }
    return db
        .select({
            id: dispute.id,
            referenceNumber: dispute.referenceNumber,
            reason: dispute.reason,
            evidence: dispute.evidence,
            status: dispute.status,
            counterpartyResponse: dispute.counterpartyResponse,
            counterpartyNote: dispute.counterpartyNote,
            rraAction: dispute.rraAction,
            resolution: dispute.resolution,
            rraOfficialNote: dispute.rraOfficialNote,
            createdAt: dispute.createdAt,
            transactionId: dispute.transactionId,
            filedByName: filer.name,
            filedByTin: filer.tin,
            counterpartyName: counterparty.name,
            counterpartyTin: counterparty.tin,
        })
        .from(dispute)
        .innerJoin(filer, eq(dispute.filedById, filer.id))
        .innerJoin(counterparty, eq(dispute.counterpartyId, counterparty.id))
        .where(tin ? or(eq(filer.tin, tin.trim()), eq(counterparty.tin, tin.trim())) : undefined)
        .orderBy(desc(dispute.createdAt));
}

// ---------------------------------------------------------------------------
// 6. RRA: Resolve dispute — with action type + official communication
// ---------------------------------------------------------------------------

export type RRADisputeAction =
    | "undo_transaction"
    | "adjust_amount"
    | "uphold_dispute"
    | "dismiss";

const ACTION_LABELS: Record<RRADisputeAction, string> = {
    undo_transaction: "Transaction Undone",
    adjust_amount: "Amount Adjusted",
    uphold_dispute: "Dispute Upheld",
    dismiss: "Dispute Dismissed",
};

export async function resolveDispute(
    disputeId: string,
    data: {
        action: RRADisputeAction;
        resolution: string;
        officialNote: string;
        adjustedUnitPrice?: number;
    },
) {
    const { staff, ...session } = await requireRRAOperationalPermission("investigation.case.manage");

    if (!data.resolution?.trim()) {
        throw new Error("Resolution notes are required");
    }

    if (!data.officialNote?.trim()) {
        throw new Error("An official communication to both parties is required");
    }

    const validActions: RRADisputeAction[] = ["undo_transaction", "adjust_amount", "uphold_dispute", "dismiss"];
    if (!validActions.includes(data.action)) throw new Error("Invalid dispute resolution action");
    if (data.action === "adjust_amount" && (!Number.isSafeInteger(data.adjustedUnitPrice) || (data.adjustedUnitPrice ?? 0) <= 0)) {
        throw new Error("A positive whole-number adjusted unit price is required");
    }

    const config = data.action === "adjust_amount" ? await getSystemConfig() : null;
    const { existingDispute, partyIds } = await db.transaction(async (tx) => {
        const [existingDispute] = await tx
            .select()
            .from(dispute)
            .where(eq(dispute.id, disputeId))
            .for("update")
            .limit(1);

        if (!existingDispute) throw new Error("Dispute not found");
        if (existingDispute.status === "resolved" || existingDispute.status === "dismissed") {
            throw new Error("This dispute has already been finalized");
        }

        const [txn] = await tx
            .select()
            .from(transaction)
            .where(eq(transaction.id, existingDispute.transactionId))
            .for("update")
            .limit(1);
        if (!txn) throw new Error("Disputed transaction not found");

        const frozenRecords = await tx
            .select()
            .from(vatRecord)
            .where(and(eq(vatRecord.transactionId, txn.id), eq(vatRecord.isFrozen, true)));
        if (frozenRecords.length === 0) throw new Error("Frozen VAT records are missing; dispute requires manual review.");

        let financialEffect: Record<string, number | string> = {};
        if (data.action === "undo_transaction") {
            if (txn.buyerId) {
                const [buyerStock] = await tx
                    .select()
                    .from(stock)
                    .where(and(eq(stock.businessId, txn.buyerId), eq(stock.productId, txn.productId)))
                    .for("update")
                    .limit(1);
                if (!buyerStock || buyerStock.quantity < txn.quantity) {
                    throw new Error("Transaction cannot be undone because the buyer no longer has the purchased stock.");
                }
                const buyerAfter = buyerStock.quantity - txn.quantity;
                await tx.update(stock)
                    .set({ quantity: buyerAfter })
                    .where(eq(stock.id, buyerStock.id));
                await tx.insert(stockMovement).values({ businessId: txn.buyerId!, productId: txn.productId, quantityDelta: -txn.quantity, quantityBefore: buyerStock.quantity, quantityAfter: buyerAfter, movementType: "dispute_reversal", sourceType: "transaction", sourceId: txn.id, actorUserId: session.user.id });
            }

            const [sellerStock] = await tx
                .select()
                .from(stock)
                .where(and(eq(stock.businessId, txn.sellerId), eq(stock.productId, txn.productId)))
                .for("update")
                .limit(1);
            if (sellerStock) {
                const sellerAfter = sellerStock.quantity + txn.quantity;
                await tx.update(stock)
                    .set({ quantity: sellerAfter })
                    .where(eq(stock.id, sellerStock.id));
                await tx.insert(stockMovement).values({ businessId: txn.sellerId, productId: txn.productId, quantityDelta: txn.quantity, quantityBefore: sellerStock.quantity, quantityAfter: sellerAfter, movementType: "dispute_reversal", sourceType: "transaction", sourceId: txn.id, actorUserId: session.user.id });
            } else {
                await tx.insert(stock).values({ businessId: txn.sellerId, productId: txn.productId, quantity: txn.quantity });
                await tx.insert(stockMovement).values({ businessId: txn.sellerId, productId: txn.productId, quantityDelta: txn.quantity, quantityBefore: 0, quantityAfter: txn.quantity, movementType: "dispute_reversal", sourceType: "transaction", sourceId: txn.id, actorUserId: session.user.id });
            }

            await tx.update(transaction)
                .set({ status: "rejected", rejectedAt: new Date() })
                .where(eq(transaction.id, txn.id));
        }

        if (data.action === "undo_transaction" || data.action === "uphold_dispute") {
            await tx.insert(vatRecord).values(frozenRecords.map((record) => ({
                transactionId: txn.id,
                businessId: record.businessId,
                vatType: record.vatType,
                amount: -record.amount,
                period: record.period,
            })));
            financialEffect = { vatReversed: frozenRecords.reduce((sum, record) => sum + record.amount, 0) };
        }

        if (data.action === "adjust_amount") {
            const adjustedTotal = Math.round(txn.quantity * (data.adjustedUnitPrice as number));
            const adjustedVat = Math.round(adjustedTotal * (config?.vatRate ?? 0));
            await tx.update(transaction).set({
                unitPrice: data.adjustedUnitPrice as number,
                totalAmount: adjustedTotal,
                vatAmount: adjustedVat,
            }).where(eq(transaction.id, txn.id));
            await tx.update(vatRecord)
                .set({ amount: adjustedVat, isFrozen: false })
                .where(and(eq(vatRecord.transactionId, txn.id), eq(vatRecord.isFrozen, true)));
            financialEffect = {
                previousUnitPrice: txn.unitPrice,
                adjustedUnitPrice: data.adjustedUnitPrice as number,
                previousTotal: txn.totalAmount,
                adjustedTotal,
                previousVat: txn.vatAmount,
                adjustedVat,
            };
        } else {
            await tx.update(vatRecord)
                .set({ isFrozen: false })
                .where(and(eq(vatRecord.transactionId, txn.id), eq(vatRecord.isFrozen, true)));
        }

        const finalStatus = data.action === "dismiss" ? "dismissed" : "resolved";
        await tx.update(dispute).set({
            status: finalStatus,
            rraAction: data.action,
            resolution: data.resolution.trim(),
            rraOfficialNote: data.officialNote.trim(),
            resolvedById: session.user.id,
        }).where(eq(dispute.id, disputeId));

        const actionLabel = ACTION_LABELS[data.action];
        const partyIds = [existingDispute.filedById, existingDispute.counterpartyId];
        await tx.insert(notification).values(partyIds.map((userId) => ({
            userId,
            type: "system",
            title: `Dispute ${existingDispute.referenceNumber} — ${actionLabel}`,
            message: `RRA Official Decision: ${data.officialNote.trim()}`,
            link: "/dashboard/disputes",
        })));

        await tx.insert(auditLog).values({
            userId: session.user.id,
            action: "DISPUTE_RESOLVED_BY_RRA",
            targetType: "dispute",
            targetId: disputeId,
            metadata: JSON.stringify({
                rraAction: data.action,
                resolution: data.resolution.trim(),
                resolvedBy: staff.staffId,
                referenceNumber: existingDispute.referenceNumber,
                ...financialEffect,
            }),
        });

        return { existingDispute, partyIds };
    });

    for (const partyId of partyIds) {
        emitToUser(partyId, "dispute:resolved", {
            disputeId,
            action: data.action,
            referenceNumber: existingDispute.referenceNumber,
        });
    }

    return { success: true };
}
