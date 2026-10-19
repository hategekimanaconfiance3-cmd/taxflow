import "server-only";

import { tool } from "ai";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import db from "@/db/drizzle";
import { auditLog, notification, user } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireRRASession } from "@/lib/auth-guard";

const TRADER_ROLES = sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`;

async function findTraderByTin(tin: string) {
    const [trader] = await db
        .select({ id: user.id, name: user.name, businessName: user.businessName, tinNumber: user.tinNumber, role: user.role })
        .from(user)
        .where(and(eq(user.tinNumber, tin), TRADER_ROLES))
        .limit(1);
    if (!trader) throw new Error("No registered manufacturer, wholesaler, or retailer was found with that TIN.");
    return trader;
}

/** Operational RRA actions only. Each execution is gated again server-side and logged. */
export function createRraActionTools(clearanceLevel: string) {
    const canOpenReviews = clearanceLevel === "compliance_officer" || clearanceLevel === "tax_compliance_officer";
    const canSendNotices = canOpenReviews || clearanceLevel === "audit_officer" || clearanceLevel === "audit_investigation_officer";

    return {
        ...(canOpenReviews ? {
            openTraderAudit: tool({
                title: "Open a compliance audit",
                description: "Propose opening an auditable compliance review for a trader by exact TIN. Use only when an RRA officer explicitly requests it. The officer must approve the exact TIN and reason in the chat before this action runs. This opens a review; it does not find wrongdoing or make a tax/enforcement decision.",
                inputSchema: z.object({
                    traderTin: z.string().trim().min(5).max(32).describe("Exact TIN of the registered trader"),
                    reason: z.string().trim().min(10).max(1000).describe("Factual reason for opening a human review, citing verified data where possible"),
                }),
                needsApproval: true,
                execute: async ({ traderTin, reason }) => {
                    const { staff, ...session } = await requireRRASession("compliance_officer");
                    const trader = await findTraderByTin(traderTin);
                    const normalizedReason = reason.trim();
                    await logAudit({
                        userId: session.user.id,
                        action: "AUDIT_OPENED",
                        targetType: "user",
                        targetId: trader.id,
                        metadata: {
                            reason: normalizedReason,
                            status: "open",
                            openedBy: staff.staffId,
                            source: "rra_ai_assistant",
                        },
                    });
                    return {
                        success: true,
                        action: "audit_opened",
                        trader: trader.businessName ?? trader.name,
                        traderTin: trader.tinNumber,
                        note: "A human compliance review was opened. This is not an official finding or enforcement decision.",
                    };
                },
            }),
            flagTraderForReview: tool({
                title: "Flag trader for human review",
                description: "Create an audit-trail flag asking an officer to review a trader by exact TIN. Use only on an explicit request and when you can state a factual reason. The officer must approve the exact TIN and reason. A flag is not a finding, risk determination, penalty, or enforcement decision.",
                inputSchema: z.object({
                    traderTin: z.string().trim().min(5).max(32).describe("Exact TIN of the registered trader"),
                    reason: z.string().trim().min(10).max(1000).describe("Factual reason for a human review; do not state that a trader committed fraud"),
                }),
                needsApproval: true,
                execute: async ({ traderTin, reason }) => {
                    const { staff, ...session } = await requireRRASession("compliance_officer");
                    const trader = await findTraderByTin(traderTin);
                    await logAudit({
                        userId: session.user.id,
                        action: "SUSPICIOUS_FLAGGED",
                        targetType: "user",
                        targetId: trader.id,
                        metadata: {
                            reason: reason.trim(),
                            flaggedBy: staff.staffId,
                            source: "rra_ai_assistant",
                            meaning: "human_review_signal_only",
                        },
                    });
                    return {
                        success: true,
                        action: "review_flag_recorded",
                        trader: trader.businessName ?? trader.name,
                        traderTin: trader.tinNumber,
                        note: "The review signal was recorded for human follow-up. It is not a finding or enforcement decision.",
                    };
                },
            }),
        } : {}),
        ...(canSendNotices ? {
            sendTraderNotice: tool({
                title: "Send a notice to a trader",
                description: "Send a short operational notice to one registered trader by exact TIN. Use only when an RRA officer explicitly asks to send it. The officer must approve the exact recipient, title, and full message before it is sent. Do not make legal conclusions, threaten penalties, or invent amounts/deadlines. This tool cannot send bulk messages.",
                inputSchema: z.object({
                    traderTin: z.string().trim().min(5).max(32).describe("Exact TIN of the intended recipient"),
                    title: z.string().trim().min(3).max(100),
                    message: z.string().trim().min(5).max(1200),
                }),
                needsApproval: true,
                execute: async ({ traderTin, title, message }) => {
                    const { staff, ...session } = await requireRRASession("compliance_officer", "audit_officer");
                    const trader = await findTraderByTin(traderTin);
                    const normalizedTitle = title.trim();
                    const normalizedMessage = message.trim();

                    await db.transaction(async (tx) => {
                        await tx.insert(notification).values({
                            userId: trader.id,
                            type: "compliance_alert",
                            title: normalizedTitle,
                            message: normalizedMessage,
                            link: "/dashboard/notifications",
                            read: false,
                        });
                        await logAudit({
                            userId: session.user.id,
                            action: "AI_TRADER_NOTICE_SENT",
                            targetType: "user",
                            targetId: trader.id,
                            metadata: {
                                title: normalizedTitle,
                                message: normalizedMessage,
                                sentBy: staff.staffId,
                                source: "rra_ai_assistant",
                            },
                        }, async (entry) => { await tx.insert(auditLog).values(entry); });
                    });

                    return {
                        success: true,
                        action: "notice_sent",
                        trader: trader.businessName ?? trader.name,
                        traderTin: trader.tinNumber,
                    };
                },
            }),
        } : {}),
    };
}

