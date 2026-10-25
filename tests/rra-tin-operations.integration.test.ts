import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test("RRA taxpayer operations enforce roles and persist status, case events, notifications, and audits", { skip: !testDatabaseUrl }, async () => {
  if (!testDatabaseUrl) return;
  const [{ Pool }, { drizzle }, schema, { and, eq, inArray }, operations] = await Promise.all([
    import("@neondatabase/serverless"),
    import("drizzle-orm/neon-serverless"),
    import("../db/schema"),
    import("drizzle-orm"),
    import("../lib/services/rra-taxpayer-operations"),
  ]);

  const pool = new Pool({ connectionString: testDatabaseUrl });
  const db = drizzle(pool, { schema });
  type TestTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
  type AuditEntry = Parameters<Parameters<typeof operations.updateClearanceStatusInTransaction>[3]>[0];
  const auditWriter = (tx: TestTransaction) => async (entry: AuditEntry) => {
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
  const actorId = randomUUID();
  const staffId = randomUUID();
  const traderId = randomUUID();
  const caseId = randomUUID();
  const actor = {
    userId: actorId,
    staffRecordId: staffId,
    roles: ["tax_compliance_officer"] as ["tax_compliance_officer"],
  };

  try {
    await db.insert(schema.user).values([
      { id: actorId, name: "RRA integration actor", email: `${actorId}@example.test`, role: "rra_staff" },
      { id: traderId, name: "TIN integration trader", email: `${traderId}@example.test`, tinNumber: `TIN-${traderId}`, role: "retailer", clearanceStatus: "pending" },
    ]);
    await db.insert(schema.rraStaff).values({ id: staffId, userId: actorId, staffId: `TEST-${staffId}`, clearanceLevel: "tax_compliance_officer" });
    await db.insert(schema.rraStaffRole).values({ id: randomUUID(), staffRecordId: staffId, role: "tax_compliance_officer" });

    const clearanceInput = { traderId, status: "suspended", reason: "Required supporting evidence is missing from this review." };
    const clearanceResult = await db.transaction((tx) => operations.updateClearanceStatusInTransaction(
      tx,
      clearanceInput,
      actor,
      auditWriter(tx),
    ));
    assert.deepEqual(clearanceResult, { success: true });
    const [storedTrader] = await db.select({ status: schema.user.clearanceStatus }).from(schema.user).where(eq(schema.user.id, traderId));
    assert.equal(storedTrader?.status, "suspended");
    const [clearanceAudit] = await db.select({ action: schema.auditLog.action }).from(schema.auditLog)
      .where(and(eq(schema.auditLog.userId, actorId), eq(schema.auditLog.targetId, traderId), eq(schema.auditLog.action, "CLEARANCE_UPDATED")));
    assert.equal(clearanceAudit?.action, "CLEARANCE_UPDATED");

    const unauthorized = await db.transaction((tx) => operations.updateClearanceStatusInTransaction(
      tx,
      { ...clearanceInput, status: "under_review" },
      { ...actor, roles: ["audit_investigation_officer"] },
      auditWriter(tx),
    ));
    assert.equal(unauthorized.success, false);
    const superAdminOperation = await db.transaction((tx) => operations.updateClearanceStatusInTransaction(
      tx,
      { ...clearanceInput, status: "under_review" },
      { ...actor, roles: ["super_admin"] },
      auditWriter(tx),
    ));
    assert.deepEqual(superAdminOperation, { success: true });
    const [superAdminStoredTrader] = await db.select({ status: schema.user.clearanceStatus }).from(schema.user).where(eq(schema.user.id, traderId));
    assert.equal(superAdminStoredTrader?.status, "under_review");
    const invalidTransition = await db.transaction((tx) => operations.updateClearanceStatusInTransaction(
      tx,
      { ...clearanceInput, status: "under_review" },
      actor,
      auditWriter(tx),
    ));
    assert.equal(invalidTransition.success, false);
    const missingReason = await db.transaction((tx) => operations.updateClearanceStatusInTransaction(
      tx,
      { ...clearanceInput, status: "under_review", reason: "short" },
      actor,
      auditWriter(tx),
    ));
    assert.equal(missingReason.success, false);

    await assert.rejects(db.transaction(async (tx) => {
      await operations.updateClearanceStatusInTransaction(
        tx,
        { ...clearanceInput, status: "suspended" },
        actor,
        async (entry) => {
          await auditWriter(tx)(entry);
          throw new Error("Simulated audit write failure");
        },
      );
    }));
    const [afterRollback] = await db.select({ status: schema.user.clearanceStatus }).from(schema.user).where(eq(schema.user.id, traderId));
    assert.equal(afterRollback?.status, "under_review");
    const auditsAfterRollback = await db.select({ id: schema.auditLog.id }).from(schema.auditLog)
      .where(and(eq(schema.auditLog.userId, actorId), eq(schema.auditLog.targetId, traderId), eq(schema.auditLog.action, "CLEARANCE_UPDATED")));
    assert.equal(auditsAfterRollback.length, 2);

    await db.insert(schema.rraCase).values({ id: caseId, traderId, title: "Document review", reason: "A review requires supporting documentation.", createdByStaffId: staffId });
    const followupResult = await db.transaction((tx) => operations.requestTaxpayerInformationInTransaction(
      tx,
      { caseId, requestType: "documents", details: "Provide the signed inventory summary for the latest reporting period." },
      actor,
      auditWriter(tx),
    ));
    assert.deepEqual(followupResult, { success: true });
    const [storedCase] = await db.select({ status: schema.rraCase.status }).from(schema.rraCase).where(eq(schema.rraCase.id, caseId));
    assert.equal(storedCase?.status, "awaiting_information");
    const events = await db.select({ eventType: schema.rraCaseEvent.eventType }).from(schema.rraCaseEvent).where(eq(schema.rraCaseEvent.caseId, caseId));
    assert.deepEqual(events.map((event) => event.eventType), ["documents_requested"]);
    const notifications = await db.select({ type: schema.notification.type, message: schema.notification.message }).from(schema.notification).where(eq(schema.notification.userId, traderId));
    assert.equal(notifications.length, 1);
    assert.match(notifications[0]?.message ?? "", /signed inventory summary/);
    const [requestAudit] = await db.select({ action: schema.auditLog.action }).from(schema.auditLog)
      .where(and(eq(schema.auditLog.userId, actorId), eq(schema.auditLog.targetId, caseId), eq(schema.auditLog.action, "RRA_DOCUMENTS_REQUESTED")));
    assert.equal(requestAudit?.action, "RRA_DOCUMENTS_REQUESTED");

    const unauthorizedFollowup = await db.transaction((tx) => operations.requestTaxpayerInformationInTransaction(
      tx,
      { caseId, requestType: "corrections", details: "Correct the missing declaration period." },
      { ...actor, roles: ["audit_investigation_officer"] },
      auditWriter(tx),
    ));
    assert.equal(unauthorizedFollowup.success, false);
  } finally {
    await db.delete(schema.auditLog).where(eq(schema.auditLog.userId, actorId));
    await db.delete(schema.rraCaseEvent).where(eq(schema.rraCaseEvent.caseId, caseId));
    await db.delete(schema.rraCase).where(eq(schema.rraCase.id, caseId));
    await db.delete(schema.notification).where(eq(schema.notification.userId, traderId));
    await db.delete(schema.rraStaffRole).where(eq(schema.rraStaffRole.staffRecordId, staffId));
    await db.delete(schema.user).where(inArray(schema.user.id, [actorId, traderId]));
    await pool.end();
  }
});
