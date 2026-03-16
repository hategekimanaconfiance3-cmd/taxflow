"use server";

import { eq, desc, and, or, sql } from "drizzle-orm";
import db from "@/db/drizzle";
import { dispute, transaction, user } from "@/db/schema";
import { requireTraderSession, requireRRASession } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/actions/notification.action";
import { emitToUser } from "@/lib/realtime";

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

    // Get the transaction — must involve this user
    const [txn] = await db
        .select()
        .from(transaction)
        .where(
            and(
                eq(transaction.id, data.transactionId),
                or(
                    eq(transaction.sellerId, session.user.id),
                    eq(transaction.buyerId, session.user.id),
                ),
            ),
        )
        .limit(1);

    if (!txn) {
        throw new Error("Transaction not found or you are not a party");
    }

    if (txn.status !== "confirmed" && txn.status !== "completed") {
        throw new Error("Only confirmed/completed transactions can be disputed");
    }

    // 48-hour window check
    const confirmedAt = txn.confirmedAt;
    if (confirmedAt) {
        const elapsed = Date.now() - new Date(confirmedAt).getTime();
        const hoursElapsed = elapsed / (1000 * 60 * 60);
        if (hoursElapsed > DISPUTE_WINDOW_HOURS) {
            throw new Error(
                `Dispute window expired. Disputes must be filed within ${DISPUTE_WINDOW_HOURS} hours of confirmation.`,
            );
        }
    }

    // Check no existing active dispute for this transaction
    const [existing] = await db
        .select({ id: dispute.id })
        .from(dispute)
        .where(
            and(
                eq(dispute.transactionId, data.transactionId),
                sql`${dispute.status} NOT IN ('resolved', 'dismissed')`,
            ),
        )
        .limit(1);

    if (existing) {
        throw new Error("An active dispute already exists for this transaction");
    }

    // Determine the counterparty
    const counterpartyId =
        txn.sellerId === session.user.id ? txn.buyerId : txn.sellerId;

    if (!counterpartyId) {
        throw new Error("Cannot file a dispute — no counterparty found");
    }

    const referenceNumber = generateRefNumber();

    const [newDispute] = await db
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

    await logAudit({
        userId: session.user.id,
        action: "DISPUTE_FILED",
        targetType: "dispute",
        targetId: newDispute.id,
        metadata: {
            transactionId: data.transactionId,
            referenceNumber,
            counterpartyId,
            reason: data.reason.trim(),
        },
    });

    // Notify counterparty — they need to acknowledge or contest
    await createNotification({
        userId: counterpartyId,
        type: "system",
        title: "Dispute Filed Against You",
        message: `A dispute (${referenceNumber}) has been filed on a transaction you were part of. You must acknowledge or contest this dispute.`,
        link: "/dashboard/disputes",
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

    const [d] = await db
        .select()
        .from(dispute)
        .where(
            and(
                eq(dispute.id, disputeId),
                eq(dispute.counterpartyId, session.user.id),
            ),
        )
        .limit(1);

    if (!d) {
        throw new Error("Dispute not found or you are not the counterparty");
    }

    if (d.counterpartyResponse !== "pending") {
        throw new Error("You have already responded to this dispute");
    }

    // Both parties agree there's a dispute → escalate to under_review
    await db
        .update(dispute)
        .set({
            counterpartyResponse: "acknowledged",
            counterpartyNote: note?.trim() || null,
            status: "under_review",
        })
        .where(eq(dispute.id, disputeId));

    await logAudit({
        userId: session.user.id,
        action: "DISPUTE_ACKNOWLEDGED",
        targetType: "dispute",
        targetId: disputeId,
        metadata: {
            referenceNumber: d.referenceNumber,
            note: note?.trim(),
        },
    });

    // Notify filer
    await createNotification({
        userId: d.filedById,
        type: "system",
        title: "Dispute Acknowledged",
        message: `The counterparty has acknowledged dispute ${d.referenceNumber}. It has been escalated to RRA for review.`,
        link: "/dashboard/disputes",
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

    const [d] = await db
        .select()
        .from(dispute)
        .where(
            and(
                eq(dispute.id, disputeId),
                eq(dispute.counterpartyId, session.user.id),
            ),
        )
        .limit(1);

    if (!d) {
        throw new Error("Dispute not found or you are not the counterparty");
    }

    if (d.counterpartyResponse !== "pending") {
        throw new Error("You have already responded to this dispute");
    }

    // Contested — still goes to RRA for review
    await db
        .update(dispute)
        .set({
            counterpartyResponse: "contested",
            counterpartyNote: note.trim(),
            status: "under_review",
        })
        .where(eq(dispute.id, disputeId));

    await logAudit({
        userId: session.user.id,
        action: "DISPUTE_CONTESTED",
        targetType: "dispute",
        targetId: disputeId,
        metadata: {
            referenceNumber: d.referenceNumber,
            note: note.trim(),
        },
    });

    // Notify filer
    await createNotification({
        userId: d.filedById,
        type: "system",
        title: "Dispute Contested",
        message: `The counterparty has contested dispute ${d.referenceNumber}. It has been escalated to RRA for review.`,
        link: "/dashboard/disputes",
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

export async function getAllDisputes() {
    await requireRRASession("compliance_officer", "audit_officer");

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
    },
) {
    const { staff, ...session } = await requireRRASession("compliance_officer", "audit_officer");

    if (!data.resolution?.trim()) {
        throw new Error("Resolution notes are required");
    }

    if (!data.officialNote?.trim()) {
        throw new Error("An official communication to both parties is required");
    }

    const [existingDispute] = await db
        .select()
        .from(dispute)
        .where(eq(dispute.id, disputeId))
        .limit(1);

    if (!existingDispute) {
        throw new Error("Dispute not found");
    }

    if (existingDispute.status === "resolved" || existingDispute.status === "dismissed") {
        throw new Error("This dispute has already been finalized");
    }

    const finalStatus = data.action === "dismiss" ? "dismissed" : "resolved";

    await db
        .update(dispute)
        .set({
            status: finalStatus,
            rraAction: data.action,
            resolution: data.resolution.trim(),
            rraOfficialNote: data.officialNote.trim(),
            resolvedById: session.user.id,
        })
        .where(eq(dispute.id, disputeId));

    await logAudit({
        userId: session.user.id,
        action: "DISPUTE_RESOLVED_BY_RRA",
        targetType: "dispute",
        targetId: disputeId,
        metadata: {
            rraAction: data.action,
            resolution: data.resolution.trim(),
            resolvedBy: staff.staffId,
            referenceNumber: existingDispute.referenceNumber,
        },
    });

    const actionLabel = ACTION_LABELS[data.action];

    // Notify BOTH parties with the official communication
    const partyIds = [existingDispute.filedById, existingDispute.counterpartyId];

    for (const partyId of partyIds) {
        await createNotification({
            userId: partyId,
            type: "system",
            title: `Dispute ${existingDispute.referenceNumber} — ${actionLabel}`,
            message: `RRA Official Decision: ${data.officialNote.trim()}`,
            link: "/dashboard/disputes",
        });

        emitToUser(partyId, "dispute:resolved", {
            disputeId,
            action: data.action,
            referenceNumber: existingDispute.referenceNumber,
        });
    }

    return { success: true };
}
