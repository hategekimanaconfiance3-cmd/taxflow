import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { RRARole } from "../lib/rra-rbac";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test("admin communications persist, isolate recipients, prevent duplicate sends, audit, notify, and roll back", { skip: !testDatabaseUrl }, async () => {
  if (!testDatabaseUrl) return;
  const [{ Pool }, { drizzle }, schema, { and, eq, inArray }, service] = await Promise.all([
    import("@neondatabase/serverless"),
    import("drizzle-orm/neon-serverless"),
    import("../db/schema"),
    import("drizzle-orm"),
    import("../lib/services/admin-communications"),
  ]);
  const pool = new Pool({ connectionString: testDatabaseUrl });
  const db = drizzle(pool, { schema });
  type TestTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
  const senderId = randomUUID();
  const recipientOneId = randomUUID();
  const recipientTwoId = randomUUID();
  const disabledId = randomUUID();
  const traderId = randomUUID();
  const staffRecordIds = [senderId, recipientOneId, recipientTwoId, disabledId].map(() => randomUUID());
  const actor = { userId: senderId, roles: ["super_admin"] as RRARole[] };
  const conversationIds: string[] = [];
  const writeAudit = (tx: TestTransaction) => async (entry: { userId: string; action: string; targetType?: string; targetId?: string; metadata?: Record<string, unknown>; beforeState?: Record<string, unknown>; afterState?: Record<string, unknown> }) => {
    await tx.insert(schema.auditLog).values({
      userId: entry.userId,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      beforeState: entry.beforeState,
      afterState: entry.afterState,
    });
  };

  try {
    await db.insert(schema.user).values([
      { id: senderId, name: "Communications Super Admin", email: `${senderId}@test.invalid`, role: "rra_staff" },
      { id: recipientOneId, name: "Eligible Admin One", email: `${recipientOneId}@test.invalid`, role: "rra_staff" },
      { id: recipientTwoId, name: "Eligible Admin Two", email: `${recipientTwoId}@test.invalid`, role: "rra_staff" },
      { id: disabledId, name: "Disabled Admin", email: `${disabledId}@test.invalid`, role: "rra_staff", isActive: false },
      { id: traderId, name: "Not an Admin", email: `${traderId}@test.invalid`, role: "retailer" },
    ]);
    await db.insert(schema.rraStaff).values([
      { id: staffRecordIds[0], userId: senderId, staffId: `C-${staffRecordIds[0]}`, clearanceLevel: "super_admin" },
      { id: staffRecordIds[1], userId: recipientOneId, staffId: `C-${staffRecordIds[1]}`, clearanceLevel: "reporting_officer" },
      { id: staffRecordIds[2], userId: recipientTwoId, staffId: `C-${staffRecordIds[2]}`, clearanceLevel: "audit_officer" },
      { id: staffRecordIds[3], userId: disabledId, staffId: `C-${staffRecordIds[3]}`, clearanceLevel: "reporting_officer" },
    ]);

    const broadcastKey = randomUUID();
    const broadcastInput = {
      mode: "broadcast", subject: "Scheduled maintenance", body: "The portal will be unavailable briefly.", priority: "high",
      recipientIds: [recipientOneId, recipientTwoId], allEligible: true, confirmationText: "SEND TO ALL", idempotencyKey: broadcastKey,
    };
    const broadcast = await db.transaction((tx) => service.sendCommunicationInTransaction(tx, broadcastInput, actor, writeAudit(tx)));
    if (!broadcast.success) throw new Error(broadcast.error);
    assert.equal(broadcast.success, true);
    conversationIds.push(broadcast.conversationId);
    assert.equal(broadcast.notificationRows.length, 2, "active RRA staff receive persisted in-app notifications");

    const participants = await db.select({ userId: schema.adminConversationParticipant.userId }).from(schema.adminConversationParticipant)
      .where(eq(schema.adminConversationParticipant.conversationId, broadcast.conversationId));
    assert.deepEqual(new Set(participants.map((row) => row.userId)), new Set([senderId, recipientOneId, recipientTwoId]));
    const auditRows = await db.select({ action: schema.auditLog.action, metadata: schema.auditLog.metadata }).from(schema.auditLog)
      .where(and(eq(schema.auditLog.targetId, broadcast.conversationId), eq(schema.auditLog.userId, senderId)));
    assert.equal(auditRows[0]?.action, "ADMIN_COMMUNICATION_BROADCAST_SENT");
    assert.equal(auditRows[0]?.metadata?.includes("portal will be unavailable"), false, "audit metadata excludes message content");

    const staleRecipientSnapshot = await db.transaction((tx) => service.sendCommunicationInTransaction(tx, {
      ...broadcastInput, recipientIds: [recipientOneId], idempotencyKey: randomUUID(),
    }, actor, writeAudit(tx)));
    assert.equal(staleRecipientSnapshot.success, false, "all-admin sends reject an incomplete recipient snapshot");

    const ineligibleRecipient = await db.transaction((tx) => service.sendCommunicationInTransaction(tx, {
      ...broadcastInput, allEligible: false, recipientIds: [disabledId], confirmationText: "SEND BROADCAST", idempotencyKey: randomUUID(),
    }, actor, writeAudit(tx)));
    assert.equal(ineligibleRecipient.success, false, "disabled staff cannot be selected as recipients");

    const retriedBroadcast = await db.transaction((tx) => service.sendCommunicationInTransaction(tx, broadcastInput, actor, writeAudit(tx)));
    assert.equal(retriedBroadcast.success && retriedBroadcast.duplicate, true);
    assert.equal((await db.select().from(schema.adminConversation).where(eq(schema.adminConversation.id, broadcast.conversationId))).length, 1);
    assert.equal((await db.select().from(schema.adminCommunicationMessage).where(eq(schema.adminCommunicationMessage.conversationId, broadcast.conversationId))).length, 1);

    const unauthorizedSend = await db.transaction((tx) => service.sendCommunicationInTransaction(tx, {
      ...broadcastInput, idempotencyKey: randomUUID(), allEligible: false, recipientIds: [recipientOneId], confirmationText: "SEND BROADCAST",
    }, { userId: recipientOneId, roles: ["reporting_officer"] }, writeAudit(tx)));
    assert.equal(unauthorizedSend.success, false);

    const directInput = {
      mode: "direct", subject: "Review request", body: "Please review the attached timeline.", priority: "normal",
      recipientIds: [recipientOneId], allEligible: false, confirmationText: "", idempotencyKey: randomUUID(),
    };
    const direct = await db.transaction((tx) => service.sendCommunicationInTransaction(tx, directInput, actor, writeAudit(tx)));
    if (!direct.success) throw new Error(direct.error);
    assert.equal(direct.success, true);
    conversationIds.push(direct.conversationId);
    const directParticipants = await db.select({ userId: schema.adminConversationParticipant.userId }).from(schema.adminConversationParticipant)
      .where(eq(schema.adminConversationParticipant.conversationId, direct.conversationId));
    assert.deepEqual(new Set(directParticipants.map((row) => row.userId)), new Set([senderId, recipientOneId]));

    const markDirectRead = await db.transaction((tx) => service.markCommunicationReadInTransaction(tx, direct.conversationId,
      { userId: recipientOneId, roles: ["reporting_officer"] }, writeAudit(tx)));
    assert.equal(markDirectRead.success, true);
    const directNotificationLink = `/admin/communications?conversationId=${encodeURIComponent(direct.conversationId)}`;
    const [readNotification] = await db.select({ read: schema.notification.read }).from(schema.notification)
      .where(and(eq(schema.notification.userId, recipientOneId), eq(schema.notification.link, directNotificationLink)));
    assert.equal(readNotification?.read, true, "marking a conversation read also updates its persisted inbox notification");
    const deniedRead = await db.transaction((tx) => service.markCommunicationReadInTransaction(tx, direct.conversationId,
      { userId: recipientTwoId, roles: ["audit_officer"] }, writeAudit(tx)));
    assert.equal(deniedRead.success, false, "a nonparticipant cannot mark/read another conversation");
    const deniedBroadcastReply = await db.transaction((tx) => service.replyToCommunicationInTransaction(tx, {
      conversationId: broadcast.conversationId, body: "This must stay private.", idempotencyKey: randomUUID(),
    }, { userId: recipientOneId, roles: ["reporting_officer"] }, writeAudit(tx)));
    assert.equal(deniedBroadcastReply.success, false, "broadcast recipients cannot create shared replies");
    const deniedPrivateReply = await db.transaction((tx) => service.replyToCommunicationInTransaction(tx, {
      conversationId: direct.conversationId, body: "Unauthorized reply.", idempotencyKey: randomUUID(),
    }, { userId: recipientTwoId, roles: ["audit_officer"] }, writeAudit(tx)));
    assert.equal(deniedPrivateReply.success, false, "nonparticipants cannot reply to private messages");

    const reply = await db.transaction((tx) => service.replyToCommunicationInTransaction(tx, {
      conversationId: direct.conversationId, body: "I have reviewed it.", idempotencyKey: randomUUID(),
    }, { userId: recipientOneId, roles: ["reporting_officer"] }, writeAudit(tx)));
    assert.equal(reply.success, true);
    const storedMessages = await db.select({ body: schema.adminCommunicationMessage.body, senderId: schema.adminCommunicationMessage.senderId })
      .from(schema.adminCommunicationMessage).where(eq(schema.adminCommunicationMessage.conversationId, direct.conversationId));
    assert.equal(storedMessages.length, 2);
    assert.ok(storedMessages.some((message) => message.body === "I have reviewed it."));

    const rollbackKey = randomUUID();
    const notificationCountBeforeRollback = await db.select({ id: schema.notification.id }).from(schema.notification)
      .where(eq(schema.notification.type, "admin_communication"));
    await assert.rejects(db.transaction((tx) => service.sendCommunicationInTransaction(tx, {
      ...directInput, recipientIds: [recipientTwoId], idempotencyKey: rollbackKey,
    }, actor, async () => { throw new Error("Simulated audit failure"); })), /Simulated audit failure/);
    assert.equal((await db.select().from(schema.adminCommunicationMessage).where(eq(schema.adminCommunicationMessage.idempotencyKey, rollbackKey))).length, 0);
    const notificationCountAfterRollback = await db.select({ id: schema.notification.id }).from(schema.notification)
      .where(eq(schema.notification.type, "admin_communication"));
    assert.equal(notificationCountAfterRollback.length, notificationCountBeforeRollback.length);
  } finally {
    if (conversationIds.length) {
      await db.delete(schema.auditLog).where(and(eq(schema.auditLog.targetType, "admin_conversation"), inArray(schema.auditLog.targetId, conversationIds)));
      await db.delete(schema.adminConversation).where(inArray(schema.adminConversation.id, conversationIds));
    }
    await db.delete(schema.notification).where(inArray(schema.notification.userId, [senderId, recipientOneId, recipientTwoId, disabledId, traderId]));
    await db.delete(schema.rraStaff).where(inArray(schema.rraStaff.id, staffRecordIds));
    await db.delete(schema.user).where(inArray(schema.user.id, [senderId, recipientOneId, recipientTwoId, disabledId, traderId]));
    await pool.end();
  }
});
