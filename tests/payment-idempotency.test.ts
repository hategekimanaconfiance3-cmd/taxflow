import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { auditLog, taxPayment, taxPaymentEvent, user } from '../db/schema';
import { taxPaymentSubmissionSchema } from '../lib/validation/tax-payment.schema';

const databaseUrl = process.env.TEST_DATABASE_URL;
function isDisposableLocalDatabase(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    const localHost = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
    const testDatabase = /(?:test|testing|disposable)/i.test(decodeURIComponent(url.pathname));
    return localHost && testDatabase;
  } catch {
    return false;
  }
}
const safeDatabaseUrl = isDisposableLocalDatabase(databaseUrl) ? databaseUrl : undefined;
const databaseSkipReason = 'Requires TEST_DATABASE_URL pointing to a disposable local PostgreSQL database whose name includes test, testing, or disposable.';

test('payment submission requires a UUID idempotency key and rejects client amount manipulation', () => {
  const valid = taxPaymentSubmissionSchema.safeParse({
    method: 'mobile_money',
    reference: 'receipt-123',
    idempotencyKey: randomUUID(),
  });
  const manipulatedAmount = taxPaymentSubmissionSchema.safeParse({
    amount: -1,
    method: 'cash',
    idempotencyKey: randomUUID(),
  });
  const invalid = taxPaymentSubmissionSchema.safeParse({ method: 'cash', idempotencyKey: 'not-a-uuid' });

  assert.equal(valid.success, true);
  assert.equal(manipulatedAmount.success, false);
  assert.equal(invalid.success, false);
});

test(
  'concurrent payment retries with one business key create exactly one row',
    { skip: safeDatabaseUrl ? false : databaseSkipReason },
  async () => {
    const client = postgres(safeDatabaseUrl!);
    const db = drizzle(client);
    const businessId = randomUUID();
    const idempotencyKey = randomUUID();

    try {
      await db.insert(user).values({
        id: businessId,
        name: 'Payment idempotency test',
        email: `${businessId}@example.test`,
      });

      const insertPayment = () =>
        db
          .insert(taxPayment)
          .values({
            businessId,
            amount: 1000,
            method: 'mobile_money',
            status: 'pending',
            idempotencyKey,
          })
          .onConflictDoNothing({ target: [taxPayment.businessId, taxPayment.idempotencyKey] })
          .returning({ id: taxPayment.id });

      const results = await Promise.all([insertPayment(), insertPayment()]);
      assert.equal(results.flat().length, 1);

      const storedPayments = await db
        .select({ id: taxPayment.id })
        .from(taxPayment)
        .where(and(eq(taxPayment.businessId, businessId), eq(taxPayment.idempotencyKey, idempotencyKey)));
      assert.equal(storedPayments.length, 1);
    } finally {
      await db
        .delete(taxPayment)
        .where(and(eq(taxPayment.businessId, businessId), eq(taxPayment.idempotencyKey, idempotencyKey)));
      await db.delete(user).where(eq(user.id, businessId));
      await client.end();
    }
  },
);

test(
  'payment event history rejects mutation and duplicate event keys',
  { skip: safeDatabaseUrl ? false : databaseSkipReason },
  async () => {
    const client = postgres(safeDatabaseUrl!);
    const db = drizzle(client);
    const businessId = randomUUID();
    const paymentId = randomUUID();
    const eventKey = `${paymentId}:submitted`;
    let eventTableReady = false;

    try {
      await db.insert(user).values({ id: businessId, name: 'Payment event test', email: `${businessId}@example.test` });
      await db.insert(taxPayment).values({
        id: paymentId, businessId, amount: 1000, method: 'mobile_money', status: 'pending',
        workflowStatus: 'AWAITING_CONFIRMATION',
      });
      await db.insert(taxPaymentEvent).values({
        paymentId, eventKey, eventType: 'PAYMENT_SUBMITTED_FOR_REVIEW',
        fromStatus: null, toStatus: 'AWAITING_CONFIRMATION', actorUserId: businessId,
      });
      eventTableReady = true;

      await assert.rejects(db.update(taxPaymentEvent).set({ eventType: 'TAMPERED' }).where(eq(taxPaymentEvent.eventKey, eventKey)));
      await assert.rejects(db.delete(taxPaymentEvent).where(eq(taxPaymentEvent.eventKey, eventKey)));
      await assert.rejects(db.insert(taxPaymentEvent).values({
        paymentId, eventKey, eventType: 'REPLAYED', fromStatus: null, toStatus: 'PAID', actorUserId: businessId,
      }));
    } finally {
      if (eventTableReady) await client.unsafe('ALTER TABLE tax_payment_event DISABLE TRIGGER tax_payment_event_append_only');
      if (eventTableReady) await db.delete(taxPaymentEvent).where(eq(taxPaymentEvent.eventKey, eventKey));
      await db.delete(taxPayment).where(eq(taxPayment.id, paymentId));
      await db.delete(user).where(eq(user.id, businessId));
      if (eventTableReady) await client.unsafe('ALTER TABLE tax_payment_event ENABLE TRIGGER tax_payment_event_append_only');
      await client.end();
    }
  },
);

test(
  'audit log rows reject updates and deletes',
  { skip: safeDatabaseUrl ? false : databaseSkipReason },
  async () => {
    const { readFile } = await import('node:fs/promises');
    const client = postgres(safeDatabaseUrl!);
    const db = drizzle(client);
    const userId = randomUUID();
    const auditId = randomUUID();
    let triggerInstalled = false;

    try {
      await client.unsafe('DROP TRIGGER IF EXISTS audit_log_append_only ON audit_log');
      const migration = await readFile('db/migrations/taxflow/0003_audit_log_immutable.sql', 'utf8');
      await client.unsafe(migration);
      triggerInstalled = true;

      await db.insert(user).values({
        id: userId,
        name: 'Audit immutability test',
        email: `${userId}@example.test`,
      });
      await db.insert(auditLog).values({
        id: auditId,
        userId,
        action: 'TEST_AUDIT_ENTRY',
      });

      await assert.rejects(
        db.update(auditLog).set({ action: 'TAMPERED' }).where(eq(auditLog.id, auditId)),
      );
      await assert.rejects(db.delete(auditLog).where(eq(auditLog.id, auditId)));
    } finally {
      if (triggerInstalled) {
        await client.unsafe('ALTER TABLE audit_log DISABLE TRIGGER audit_log_append_only');
      }
      await db.delete(auditLog).where(eq(auditLog.id, auditId));
      await db.delete(user).where(eq(user.id, userId));
      if (triggerInstalled) {
        await client.unsafe('ALTER TABLE audit_log ENABLE TRIGGER audit_log_append_only');
      }
      await client.end();
    }
  },
);
