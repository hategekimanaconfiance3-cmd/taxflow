import { and, count, eq, gte, ne } from "drizzle-orm";
import { z } from "zod";
import db from "@/db/drizzle";
import {
  adminCommunicationMessage,
  adminConversation,
  adminConversationParticipant,
  notification,
  rraStaff,
  user,
} from "@/db/schema";
import { hasRRAPermission, type RRARole } from "@/lib/rra-rbac";
import type { logAudit } from "@/lib/audit";

type Transaction = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];
type AuditEntry = Parameters<typeof logAudit>[0];
type AuditWriter = (entry: AuditEntry) => Promise<void>;

export type CommunicationActor = { userId: string; roles: RRARole[] };
export type CommunicationResult =
  | { success: true; conversationId: string; duplicate: boolean; notificationRows: Array<{ id: string; userId: string; type: string; title: string; message: string; link: string }> }
  | { success: false; error: string };

const sendSchema = z.object({
  mode: z.enum(["direct", "broadcast"]),
  subject: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(10_000),
  priority: z.enum(["low", "normal", "high"]),
  recipientIds: z.array(z.string().min(1).max(128)).max(2_000),
  allEligible: z.boolean(),
  confirmationText: z.string().optional(),
  idempotencyKey: z.string().uuid(),
}).strict();

const replySchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1).max(10_000),
  idempotencyKey: z.string().uuid(),
}).strict();

function can(roles: readonly RRARole[], permission: "communications.send" | "communications.read" | "communications.reply") {
  return roles.some((role) => hasRRAPermission(role, permission));
}

async function eligibleAdministrators(tx: Transaction, senderId: string) {
  return tx.select({ userId: user.id, name: user.name, email: user.email, staffId: rraStaff.staffId, role: rraStaff.clearanceLevel })
    .from(rraStaff)
    .innerJoin(user, eq(rraStaff.userId, user.id))
    .where(and(eq(rraStaff.isActive, true), eq(user.isActive, true), eq(user.role, "rra_staff"), ne(user.id, senderId)))
    .orderBy(rraStaff.staffId)
    .limit(2_001);
}

async function existingIdempotentMessage(tx: Transaction, key: string, actorId: string) {
  const [existing] = await tx.select({ conversationId: adminCommunicationMessage.conversationId, senderId: adminCommunicationMessage.senderId })
    .from(adminCommunicationMessage).where(eq(adminCommunicationMessage.idempotencyKey, key)).limit(1);
  if (!existing) return null;
  return existing.senderId === actorId ? existing.conversationId : "forbidden";
}

export async function sendCommunicationInTransaction(
  tx: Transaction,
  input: unknown,
  actor: CommunicationActor,
  writeAudit: AuditWriter,
): Promise<CommunicationResult> {
  if (!can(actor.roles, "communications.send")) return { success: false, error: "You do not have permission to send administrator communications." };
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Enter valid message details." };
  const data = parsed.data;
  if (data.mode === "direct" && (data.allEligible || data.recipientIds.length !== 1)) return { success: false, error: "Choose exactly one administrator for a direct message." };
  if (data.mode === "broadcast" && data.recipientIds.length < 1) return { success: false, error: "Choose at least one eligible administrator." };
  if (data.mode === "broadcast" && data.confirmationText !== (data.allEligible ? "SEND TO ALL" : "SEND BROADCAST")) {
    return { success: false, error: "Confirm the broadcast recipients before sending." };
  }

  const priorConversation = await existingIdempotentMessage(tx, data.idempotencyKey, actor.userId);
  if (priorConversation === "forbidden") return { success: false, error: "This submission key has already been used." };
  if (priorConversation) return { success: true, conversationId: priorConversation, duplicate: true, notificationRows: [] };

  const eligible = await eligibleAdministrators(tx, actor.userId);
  if (eligible.length > 2_000) return { success: false, error: "There are too many eligible recipients for one message." };
  const recipientIds = [...new Set(data.recipientIds)];
  const eligibleIds = new Set(eligible.map((row) => row.userId));
  if (recipientIds.some((id) => !eligibleIds.has(id))) return { success: false, error: "One or more selected recipients are no longer eligible." };
  if (data.allEligible && (recipientIds.length !== eligibleIds.size || eligible.some((row) => !recipientIds.includes(row.userId)))) {
    return { success: false, error: "Eligible recipients changed since the confirmation list was loaded. Refresh and confirm the updated list." };
  }
  if (data.mode === "direct" && recipientIds.length !== 1) return { success: false, error: "Choose exactly one eligible administrator." };
  if (data.mode === "broadcast" && recipientIds.length < 1) return { success: false, error: "No eligible administrators are available to receive this broadcast." };

  const [recentCount] = await tx.select({ value: count() }).from(adminCommunicationMessage)
    .where(and(eq(adminCommunicationMessage.senderId, actor.userId), gte(adminCommunicationMessage.createdAt, new Date(Date.now() - 60_000))));
  if (Number(recentCount?.value ?? 0) >= 10) return { success: false, error: "Message limit reached. Wait a minute and try again." };

  const conversationId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const now = new Date();
  await tx.insert(adminConversation).values({
    id: conversationId,
    kind: data.mode,
    subject: data.subject,
    priority: data.priority,
    createdBy: actor.userId,
    createdAt: now,
    updatedAt: now,
  });
  await tx.insert(adminConversationParticipant).values([
    { id: crypto.randomUUID(), conversationId, userId: actor.userId, participantType: "sender", joinedAt: now },
    ...recipientIds.map((userId) => ({ id: crypto.randomUUID(), conversationId, userId, participantType: "recipient", joinedAt: now })),
  ]);

  const [saved] = await tx.insert(adminCommunicationMessage).values({
    id: messageId,
    conversationId,
    senderId: actor.userId,
    body: data.body,
    idempotencyKey: data.idempotencyKey,
    createdAt: now,
  }).onConflictDoNothing({ target: adminCommunicationMessage.idempotencyKey }).returning({ id: adminCommunicationMessage.id });
  if (!saved) {
    await tx.delete(adminConversation).where(eq(adminConversation.id, conversationId));
    const existing = await existingIdempotentMessage(tx, data.idempotencyKey, actor.userId);
    if (existing && existing !== "forbidden") return { success: true, conversationId: existing, duplicate: true, notificationRows: [] };
    return { success: false, error: "This message was already submitted. Refresh your inbox." };
  }

  const link = `/admin/communications?conversationId=${encodeURIComponent(conversationId)}`;
  const notificationRows = recipientIds.map((userId) => ({
    id: crypto.randomUUID(),
    userId,
    type: "admin_communication",
    title: data.subject,
    message: "A new administrator message is available in TaxFlow Communications.",
    link,
  }));
  if (notificationRows.length) await tx.insert(notification).values(notificationRows);
  await tx.update(adminConversation).set({ updatedAt: now }).where(eq(adminConversation.id, conversationId));
  await writeAudit({
    userId: actor.userId,
    action: data.mode === "broadcast" ? "ADMIN_COMMUNICATION_BROADCAST_SENT" : "ADMIN_COMMUNICATION_DIRECT_SENT",
    targetType: "admin_conversation",
    targetId: conversationId,
    metadata: { recipientCount: recipientIds.length, priority: data.priority },
  });
  return { success: true, conversationId, duplicate: false, notificationRows };
}

export async function replyToCommunicationInTransaction(
  tx: Transaction,
  input: unknown,
  actor: CommunicationActor,
  writeAudit: AuditWriter,
): Promise<CommunicationResult> {
  if (!can(actor.roles, "communications.reply")) return { success: false, error: "You do not have permission to reply to administrator communications." };
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Enter a valid reply." };
  const data = parsed.data;
  const priorConversation = await existingIdempotentMessage(tx, data.idempotencyKey, actor.userId);
  if (priorConversation === "forbidden") return { success: false, error: "This submission key has already been used." };
  if (priorConversation) return { success: true, conversationId: priorConversation, duplicate: true, notificationRows: [] };

  const [membership] = await tx.select({ conversationId: adminConversation.id, kind: adminConversation.kind, subject: adminConversation.subject })
    .from(adminConversationParticipant)
    .innerJoin(adminConversation, eq(adminConversationParticipant.conversationId, adminConversation.id))
    .where(and(eq(adminConversationParticipant.conversationId, data.conversationId), eq(adminConversationParticipant.userId, actor.userId)))
    .limit(1);
  if (!membership) return { success: false, error: "You are not a participant in this conversation." };
  if (membership.kind !== "direct") return { success: false, error: "Broadcasts do not accept shared replies. Start a private direct message instead." };

  const [recentCount] = await tx.select({ value: count() }).from(adminCommunicationMessage)
    .where(and(eq(adminCommunicationMessage.senderId, actor.userId), gte(adminCommunicationMessage.createdAt, new Date(Date.now() - 60_000))));
  if (Number(recentCount?.value ?? 0) >= 10) return { success: false, error: "Message limit reached. Wait a minute and try again." };

  const now = new Date();
  const [saved] = await tx.insert(adminCommunicationMessage).values({
    id: crypto.randomUUID(),
    conversationId: membership.conversationId,
    senderId: actor.userId,
    body: data.body,
    idempotencyKey: data.idempotencyKey,
    createdAt: now,
  }).onConflictDoNothing({ target: adminCommunicationMessage.idempotencyKey }).returning({ id: adminCommunicationMessage.id });
  if (!saved) {
    const existing = await existingIdempotentMessage(tx, data.idempotencyKey, actor.userId);
    if (existing && existing !== "forbidden") return { success: true, conversationId: existing, duplicate: true, notificationRows: [] };
    return { success: false, error: "This reply was already submitted. Refresh the conversation." };
  }

  const others = await tx.select({ userId: adminConversationParticipant.userId }).from(adminConversationParticipant)
    .where(and(eq(adminConversationParticipant.conversationId, membership.conversationId), ne(adminConversationParticipant.userId, actor.userId)));
  const link = `/admin/communications?conversationId=${encodeURIComponent(membership.conversationId)}`;
  const notificationRows = others.map(({ userId }) => ({
    id: crypto.randomUUID(), userId, type: "admin_communication", title: `Reply: ${membership.subject}`,
    message: "A new administrator reply is available in TaxFlow Communications.", link,
  }));
  if (notificationRows.length) await tx.insert(notification).values(notificationRows);
  await tx.update(adminConversation).set({ updatedAt: now }).where(eq(adminConversation.id, membership.conversationId));
  await writeAudit({
    userId: actor.userId,
    action: "ADMIN_COMMUNICATION_REPLY_SENT",
    targetType: "admin_conversation",
    targetId: membership.conversationId,
    metadata: { recipientCount: others.length },
  });
  return { success: true, conversationId: membership.conversationId, duplicate: false, notificationRows };
}

export async function markCommunicationReadInTransaction(
  tx: Transaction,
  conversationId: string,
  actor: CommunicationActor,
  writeAudit: AuditWriter,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!can(actor.roles, "communications.read")) return { success: false, error: "You do not have permission to read administrator communications." };
  const [participant] = await tx.select({ id: adminConversationParticipant.id, lastReadAt: adminConversationParticipant.lastReadAt })
    .from(adminConversationParticipant)
    .innerJoin(adminConversation, eq(adminConversationParticipant.conversationId, adminConversation.id))
    .where(and(eq(adminConversationParticipant.conversationId, conversationId), eq(adminConversationParticipant.userId, actor.userId)))
    .limit(1);
  if (!participant) return { success: false, error: "You are not a participant in this conversation." };
  const now = new Date();
  await tx.update(adminConversationParticipant).set({ lastReadAt: now }).where(eq(adminConversationParticipant.id, participant.id));
  const link = `/admin/communications?conversationId=${encodeURIComponent(conversationId)}`;
  await tx.update(notification).set({ read: true }).where(and(
    eq(notification.userId, actor.userId),
    eq(notification.type, "admin_communication"),
    eq(notification.link, link),
    eq(notification.read, false),
  ));
  await writeAudit({
    userId: actor.userId,
    action: "ADMIN_COMMUNICATION_MARKED_READ",
    targetType: "admin_conversation",
    targetId: conversationId,
    beforeState: { lastReadAt: participant.lastReadAt?.toISOString() ?? null },
    afterState: { lastReadAt: now.toISOString() },
  });
  return { success: true };
}
