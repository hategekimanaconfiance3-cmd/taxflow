import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { SupportTicketAuditWriter } from "../lib/services/admin-support-ticket";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test("support ticket operations persist replies, assignments, status and audits atomically with RBAC", { skip: !testDatabaseUrl }, async () => {
  if (!testDatabaseUrl) return;
  const [{ Pool }, { drizzle }, schema, { and, eq, inArray }, service] = await Promise.all([
    import("@neondatabase/serverless"),
    import("drizzle-orm/neon-serverless"),
    import("../db/schema"),
    import("drizzle-orm"),
    import("../lib/services/admin-support-ticket"),
  ]);
  const pool = new Pool({ connectionString: testDatabaseUrl });
  const db = drizzle(pool, { schema });
  type TestTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
  const actorId = randomUUID();
  const traderId = randomUUID();
  const assigneeId = randomUUID();
  const staffId = randomUUID();
  const ticketId = randomUUID();
  const actorStaffId = randomUUID();
  const supportRoles = ["tax_compliance_officer"] as const;
  const actor = { actorId, roles: supportRoles };
  const auditWriter = (tx: TestTransaction): SupportTicketAuditWriter => async (_transaction, entry) => {
    await tx.insert(schema.auditLog).values(entry);
  };

  try {
    await db.insert(schema.user).values([
      { id: actorId, name: "Support officer", email: `${actorId}@test.invalid`, role: "rra_staff" },
      { id: traderId, name: "Integration trader", email: `${traderId}@test.invalid`, role: "retailer" },
      { id: assigneeId, name: "Support assignee", email: `${assigneeId}@test.invalid`, role: "rra_staff" },
    ]);
    await db.insert(schema.rraStaff).values([
      { id: actorStaffId, userId: actorId, staffId: `S-${actorStaffId}`, clearanceLevel: "tax_compliance_officer" },
      { id: staffId, userId: assigneeId, staffId: `S-${staffId}`, clearanceLevel: "tax_compliance_officer" },
    ]);
    await db.insert(schema.rraStaffRole).values([
      { id: randomUUID(), staffRecordId: actorStaffId, role: "tax_compliance_officer" },
      { id: randomUUID(), staffRecordId: staffId, role: "tax_compliance_officer" },
    ]);
    await db.insert(schema.supportTicket).values({ id: ticketId, traderId, subject: "Test support request", description: "Need help with the filing page." });

    const assigned = await db.transaction((tx) => service.assignSupportTicketInTransaction(tx, {
      ticketId, assigneeUserId: assigneeId, actorId, actorStaffId, roles: supportRoles,
    }, auditWriter(tx)));
    assert.equal(assigned.status, "in_progress");
    const reply = await db.transaction((tx) => service.replyToSupportTicketInTransaction(tx, {
      ticketId, body: "Please refresh the filing page and try again.", ...actor,
    }, auditWriter(tx)));
    const [storedMessage] = await db.select().from(schema.supportTicketMessage).where(eq(schema.supportTicketMessage.ticketId, ticketId));
    assert.equal(storedMessage?.body, "Please refresh the filing page and try again.");
    assert.equal(reply.traderId, traderId);

    const resolved = await db.transaction((tx) => service.updateSupportTicketStatusInTransaction(tx, {
      ticketId, nextStatus: "resolved", resolution: "The filing page issue was corrected.", actorId, roles: supportRoles,
    }, auditWriter(tx)));
    assert.equal(resolved.status, "resolved");
    const [persisted] = await db.select().from(schema.supportTicket).where(eq(schema.supportTicket.id, ticketId));
    assert.equal(persisted?.status, "resolved");
    assert.equal(persisted?.resolution, "The filing page issue was corrected.");
    const events = await db.select({ action: schema.auditLog.action }).from(schema.auditLog)
      .where(and(eq(schema.auditLog.targetId, ticketId), eq(schema.auditLog.userId, actorId)));
    assert.deepEqual(events.map((row) => row.action).sort(), ["TICKET_ASSIGNED", "TICKET_REPLIED", "TICKET_STATUS_UPDATED"].sort());

    await assert.rejects(db.transaction((tx) => service.updateSupportTicketStatusInTransaction(tx, {
      ticketId, nextStatus: "in_progress", actorId, roles: ["audit_investigation_officer"],
    }, auditWriter(tx))), /do not have permission/);
    await assert.rejects(db.transaction((tx) => service.updateSupportTicketStatusInTransaction(tx, {
      ticketId, nextStatus: "resolved", resolution: "Another resolution attempt.", actorId, roles: ["super_admin"],
    }, auditWriter(tx))), /do not have permission/);
    await assert.rejects(db.transaction((tx) => service.updateSupportTicketStatusInTransaction(tx, {
      ticketId, nextStatus: "open", actorId, roles: supportRoles,
    }, auditWriter(tx))), /status change is not allowed/);

    await assert.rejects(db.transaction((tx) => service.updateSupportTicketStatusInTransaction(tx, {
      ticketId, nextStatus: "closed", actorId, roles: supportRoles,
    }, async (_transaction, entry) => {
      await auditWriter(tx)(tx, entry);
      throw new Error("Simulated audit failure");
    })), /Simulated audit failure/);
    const [afterRollback] = await db.select().from(schema.supportTicket).where(eq(schema.supportTicket.id, ticketId));
    assert.equal(afterRollback?.status, "resolved");
    const statusAudits = await db.select({ id: schema.auditLog.id }).from(schema.auditLog)
      .where(and(eq(schema.auditLog.targetId, ticketId), eq(schema.auditLog.action, "TICKET_STATUS_UPDATED")));
    assert.equal(statusAudits.length, 1);
  } finally {
    await db.delete(schema.supportTicketMessage).where(eq(schema.supportTicketMessage.ticketId, ticketId));
    await db.delete(schema.auditLog).where(eq(schema.auditLog.targetId, ticketId));
    await db.delete(schema.supportTicket).where(eq(schema.supportTicket.id, ticketId));
    await db.delete(schema.rraStaffRole).where(inArray(schema.rraStaffRole.staffRecordId, [actorStaffId, staffId]));
    await db.delete(schema.rraStaff).where(inArray(schema.rraStaff.id, [actorStaffId, staffId]));
    await db.delete(schema.user).where(inArray(schema.user.id, [actorId, traderId, assigneeId]));
    await pool.end();
  }
});
