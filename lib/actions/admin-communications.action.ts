"use server";

import { and, count, desc, eq, exists, gt, ilike, inArray, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import db from "@/db/drizzle";
import {
  adminCommunicationMessage,
  adminConversation,
  adminConversationParticipant,
  auditLog,
  rraStaff,
  rraStaffRole,
  user,
} from "@/db/schema";
import { requireRRAPermission } from "@/lib/auth-guard";
import { hasRRAPermission, type RRARole } from "@/lib/rra-rbac";
import { emitToUser } from "@/lib/realtime";
import { logAudit } from "@/lib/audit";
import {
  markCommunicationReadInTransaction,
  replyToCommunicationInTransaction,
  sendCommunicationInTransaction,
  type CommunicationActor,
} from "@/lib/services/admin-communications";

const pageSchema = z.coerce.number().int().min(0).max(10_000).default(0);
const threadQuerySchema = z.object({
  conversationId: z.string().uuid(),
  messagePage: pageSchema,
});

export type CommunicationActionState = { success: boolean; error?: string; conversationId?: string };

function actorFrom(userId: string, roles: RRARole[]): CommunicationActor {
  return { userId, roles };
}

async function publishNotifications(rows: Array<{ id: string; userId: string; type: string; title: string; message: string; link: string }>) {
  for (const row of rows) {
    try {
      const { userId, ...payload } = row;
      emitToUser(userId, "notification", payload);
    } catch (error) {
      console.error("Admin communication notification persisted but realtime delivery failed", {
        notificationId: row.id,
        errorName: error instanceof Error ? error.name : typeof error,
      });
    }
  }
}

export async function getCommunicationAdminDirectory() {
  const session = await requireRRAPermission("communications.send");
  const rows = await db.select({ userId: user.id, staffRecordId: rraStaff.id, name: user.name, email: user.email, staffId: rraStaff.staffId, role: rraStaff.clearanceLevel, staffActive: rraStaff.isActive, userActive: user.isActive })
    .from(rraStaff)
    .innerJoin(user, eq(rraStaff.userId, user.id))
    .where(and(eq(user.role, "rra_staff"), ne(user.id, session.user.id)))
    .orderBy(rraStaff.staffId)
    .limit(2_000);
  const roleRows = rows.length
    ? await db.select({ staffRecordId: rraStaffRole.staffRecordId, role: rraStaffRole.role }).from(rraStaffRole).where(inArray(rraStaffRole.staffRecordId, rows.map((row) => row.staffRecordId)))
    : [];
  const rolesByStaff = new Map<string, string[]>();
  for (const assignment of roleRows) rolesByStaff.set(assignment.staffRecordId, [...(rolesByStaff.get(assignment.staffRecordId) ?? []), assignment.role]);
  return rows.map((row) => ({
    userId: row.userId,
    name: row.name,
    email: row.email,
    staffId: row.staffId,
    role: (rolesByStaff.get(row.staffRecordId)?.length ? rolesByStaff.get(row.staffRecordId)! : [row.role]).join(", "),
    eligible: row.staffActive && row.userActive,
  }));
}

export async function getAdminCommunicationsPageData(input: {
  query?: string;
  page?: string | number;
  conversationId?: string;
  messagePage?: string | number;
}) {
  const session = await requireRRAPermission("communications.read");
  const actorId = session.user.id;
  const query = (input.query ?? "").trim().slice(0, 100);
  const page = pageSchema.parse(input.page ?? 0);
  const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  const conditions = [eq(adminConversationParticipant.userId, actorId)];
  if (query) {
    conditions.push(or(
      ilike(adminConversation.subject, pattern),
      exists(db.select({ id: adminCommunicationMessage.id }).from(adminCommunicationMessage)
        .where(and(eq(adminCommunicationMessage.conversationId, adminConversation.id), ilike(adminCommunicationMessage.body, pattern)))),
    )!);
  }
  const [totalRows, conversations] = await Promise.all([
    db.select({ value: count() }).from(adminConversationParticipant)
      .innerJoin(adminConversation, eq(adminConversationParticipant.conversationId, adminConversation.id))
      .where(and(...conditions)),
    db.select({
      id: adminConversation.id,
      kind: adminConversation.kind,
      subject: adminConversation.subject,
      priority: adminConversation.priority,
      createdBy: adminConversation.createdBy,
      createdAt: adminConversation.createdAt,
      updatedAt: adminConversation.updatedAt,
    }).from(adminConversationParticipant)
      .innerJoin(adminConversation, eq(adminConversationParticipant.conversationId, adminConversation.id))
      .where(and(...conditions))
      .orderBy(desc(adminConversation.updatedAt)).limit(20).offset(page * 20),
  ]);
  const ids = conversations.map((conversation) => conversation.id);
  const [latestMessages, unreadRows] = ids.length ? await Promise.all([
    db.selectDistinctOn([adminCommunicationMessage.conversationId], {
      conversationId: adminCommunicationMessage.conversationId,
      senderId: adminCommunicationMessage.senderId,
      body: adminCommunicationMessage.body,
      createdAt: adminCommunicationMessage.createdAt,
    }).from(adminCommunicationMessage)
      .where(inArray(adminCommunicationMessage.conversationId, ids))
      .orderBy(adminCommunicationMessage.conversationId, desc(adminCommunicationMessage.createdAt)),
    db.select({ conversationId: adminConversationParticipant.conversationId, unread: count() })
      .from(adminConversationParticipant)
      .innerJoin(adminCommunicationMessage, eq(adminCommunicationMessage.conversationId, adminConversationParticipant.conversationId))
      .where(and(
        eq(adminConversationParticipant.userId, actorId),
        inArray(adminConversationParticipant.conversationId, ids),
        ne(adminCommunicationMessage.senderId, actorId),
        or(isNull(adminConversationParticipant.lastReadAt), gt(adminCommunicationMessage.createdAt, adminConversationParticipant.lastReadAt)),
      ))
      .groupBy(adminConversationParticipant.conversationId),
  ]) : [[], []];
  const latestByConversation = new Map(latestMessages.map((message) => [message.conversationId, message]));
  const unreadByConversation = new Map(unreadRows.map((row) => [row.conversationId, Number(row.unread)]));
  const inbox = conversations.map((conversation) => ({
    ...conversation,
    latestMessage: latestByConversation.get(conversation.id) ?? null,
    unreadCount: unreadByConversation.get(conversation.id) ?? 0,
  }));

  let thread: null | {
    conversation: typeof conversations[number];
    messages: Array<{ id: string; body: string; senderId: string; senderName: string; createdAt: Date }>;
    participants: Array<{ userId: string; name: string; email: string; staffId: string; participantType: string; lastReadAt: Date | null }>;
    page: number;
    messageCount: number;
    otherReadAt: Date | null;
    broadcastReadCount: number | null;
    broadcastRecipientCount: number | null;
  } = null;
  if (input.conversationId) {
    const parsedThread = threadQuerySchema.safeParse({ conversationId: input.conversationId, messagePage: input.messagePage ?? 0 });
    if (parsedThread.success) {
      const { conversationId, messagePage } = parsedThread.data;
      const [conversation] = await db.select({
        id: adminConversation.id,
        kind: adminConversation.kind,
        subject: adminConversation.subject,
        priority: adminConversation.priority,
        createdBy: adminConversation.createdBy,
        createdAt: adminConversation.createdAt,
        updatedAt: adminConversation.updatedAt,
      }).from(adminConversationParticipant)
        .innerJoin(adminConversation, eq(adminConversationParticipant.conversationId, adminConversation.id))
        .where(and(eq(adminConversation.id, conversationId), eq(adminConversationParticipant.userId, actorId)))
        .limit(1);
      if (conversation) {
        const [messageRows, participants, messageCountRows] = await Promise.all([
          db.select({ id: adminCommunicationMessage.id, body: adminCommunicationMessage.body, senderId: adminCommunicationMessage.senderId, senderName: user.name, createdAt: adminCommunicationMessage.createdAt })
            .from(adminCommunicationMessage).innerJoin(user, eq(adminCommunicationMessage.senderId, user.id))
            .where(eq(adminCommunicationMessage.conversationId, conversationId))
            .orderBy(desc(adminCommunicationMessage.createdAt)).limit(50).offset(messagePage * 50),
          db.select({ userId: adminConversationParticipant.userId, name: user.name, email: user.email, staffId: rraStaff.staffId, participantType: adminConversationParticipant.participantType, lastReadAt: adminConversationParticipant.lastReadAt })
            .from(adminConversationParticipant).innerJoin(user, eq(adminConversationParticipant.userId, user.id)).innerJoin(rraStaff, eq(rraStaff.userId, user.id))
            .where(eq(adminConversationParticipant.conversationId, conversationId)),
          db.select({ value: count() }).from(adminCommunicationMessage).where(eq(adminCommunicationMessage.conversationId, conversationId)),
        ]);
        const visibleParticipants = conversation.kind === "broadcast" && conversation.createdBy !== actorId
          ? participants.filter((participant) => participant.userId === actorId || participant.userId === conversation.createdBy)
          : participants;
        const latestMessage = messageRows[0];
        const readerRows = conversation.kind === "direct"
          ? participants.filter((participant) => participant.userId !== actorId)
          : conversation.createdBy === actorId
            ? participants.filter((participant) => participant.participantType === "recipient")
            : [];
        const broadcastReadCount = conversation.kind === "broadcast" && conversation.createdBy === actorId && latestMessage
          ? readerRows.filter((participant) => participant.lastReadAt && participant.lastReadAt >= latestMessage.createdAt).length
          : null;
        thread = {
          conversation,
          messages: messageRows.reverse(),
          participants: visibleParticipants,
          page: messagePage,
          messageCount: Number(messageCountRows[0]?.value ?? 0),
          otherReadAt: readerRows.length === 1 ? readerRows[0].lastReadAt : null,
          broadcastReadCount,
          broadcastRecipientCount: conversation.kind === "broadcast" && conversation.createdBy === actorId ? readerRows.length : null,
        };
      }
    }
  }

  const canSend = session.staff.clearanceRoles.some((role) => hasRRAPermission(role, "communications.send"));
  return {
    actorId,
    inbox,
    page,
    total: Number(totalRows[0]?.value ?? 0),
    query,
    thread,
    canSend,
    unreadTotal: inbox.reduce((sum, conversation) => sum + conversation.unreadCount, 0),
  };
}

export async function submitAdminCommunication(_previous: CommunicationActionState, formData: FormData): Promise<CommunicationActionState> {
  const session = await requireRRAPermission("communications.send");
  let recipientIds: string[] = [];
  try {
    const raw = formData.get("recipientIds");
    recipientIds = raw ? z.array(z.string()).parse(JSON.parse(String(raw))) : [];
  } catch {
    return { success: false, error: "Select valid message recipients." };
  }
  try {
    const result = await db.transaction((tx) => sendCommunicationInTransaction(tx, {
      mode: formData.get("mode"),
      subject: formData.get("subject"),
      body: formData.get("body"),
      priority: formData.get("priority"),
      recipientIds,
      allEligible: formData.get("allEligible") === "true",
      confirmationText: formData.get("confirmationText"),
      idempotencyKey: formData.get("idempotencyKey"),
    }, actorFrom(session.user.id, session.staff.clearanceRoles), async (entry) => { await logAudit(entry, async (auditEntry) => { await tx.insert(auditLog).values(auditEntry); }); }));
    if (!result.success) return result;
    await publishNotifications(result.notificationRows);
    return { success: true, conversationId: result.conversationId };
  } catch (error) {
    console.error("Administrator communication send failed", { errorName: error instanceof Error ? error.name : typeof error });
    return { success: false, error: "The message could not be sent. Refresh and try again." };
  }
}

export async function submitAdminCommunicationReply(_previous: CommunicationActionState, formData: FormData): Promise<CommunicationActionState> {
  const session = await requireRRAPermission("communications.reply");
  try {
    const result = await db.transaction((tx) => replyToCommunicationInTransaction(tx, {
      conversationId: formData.get("conversationId"),
      body: formData.get("body"),
      idempotencyKey: formData.get("idempotencyKey"),
    }, actorFrom(session.user.id, session.staff.clearanceRoles), async (entry) => { await logAudit(entry, async (auditEntry) => { await tx.insert(auditLog).values(auditEntry); }); }));
    if (!result.success) return result;
    await publishNotifications(result.notificationRows);
    return { success: true, conversationId: result.conversationId };
  } catch (error) {
    console.error("Administrator communication reply failed", { errorName: error instanceof Error ? error.name : typeof error });
    return { success: false, error: "The reply could not be sent. Refresh and try again." };
  }
}

export async function markAdminCommunicationRead(conversationId: string) {
  const session = await requireRRAPermission("communications.read");
  const parsed = z.string().uuid().safeParse(conversationId);
  if (!parsed.success) return { success: false as const, error: "Choose a valid conversation." };
  try {
    return await db.transaction((tx) => markCommunicationReadInTransaction(tx, parsed.data, actorFrom(session.user.id, session.staff.clearanceRoles), async (entry) => { await logAudit(entry, async (auditEntry) => { await tx.insert(auditLog).values(auditEntry); }); }));
  } catch (error) {
    console.error("Administrator communication read state update failed", { errorName: error instanceof Error ? error.name : typeof error });
    return { success: false as const, error: "Read status could not be updated. Retry." };
  }
}
