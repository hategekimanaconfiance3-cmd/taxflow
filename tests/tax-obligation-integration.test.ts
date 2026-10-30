import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  taxObligation,
  taxObligationAdjustment,
  taxObligationEvent,
  taxPayment,
  taxPeriodPaymentScoreSnapshot,
  user,
} from '../db/schema';
import { capturePaymentScoreSnapshot, type PaymentScoreTransaction } from '../lib/payment-engine/period-score-service';

const databaseUrl = process.env.TEST_DATABASE_URL;
function localDisposableUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)
      && /(?:test|testing|disposable)/i.test(decodeURIComponent(url.pathname));
  } catch {
    return false;
  }
}
const safeUrl = localDisposableUrl(databaseUrl) ? databaseUrl : undefined;
const skipReason = 'Requires TEST_DATABASE_URL pointing to a disposable local PostgreSQL database whose name includes test, testing, or disposable.';

test('obligation score snapshots use approved obligations, confirmed payments, credits, and tenant-bound payment links', { skip: safeUrl ? false : skipReason }, async () => {
  const client = postgres(safeUrl!);
  const db = drizzle(client);
  const taxpayerId = randomUUID();
  const otherTaxpayerId = randomUUID();
  const assessorId = randomUUID();
  const approverId = randomUUID();
  const obligationId = randomUUID();
  const periodKey = '2026-Q3';
  const assessmentReference = `RRA-${randomUUID()}`;
  const paymentId = randomUUID();
  const pendingPaymentId = randomUUID();
  const adjustmentId = randomUUID();
  const eventId = randomUUID();
  const eventKey = `integration:${randomUUID()}`;

  try {
    await db.insert(user).values([
      { id: taxpayerId, name: 'Phase 2 test taxpayer', email: `${taxpayerId}@example.test`, role: 'retailer' },
      { id: otherTaxpayerId, name: 'Phase 2 other taxpayer', email: `${otherTaxpayerId}@example.test`, role: 'retailer' },
      { id: assessorId, name: 'Phase 2 assessor', email: `${assessorId}@example.test`, role: 'rra_staff' },
      { id: approverId, name: 'Phase 2 approver', email: `${approverId}@example.test`, role: 'rra_staff' },
    ]);
    await db.insert(taxObligation).values({
      id: obligationId,
      taxpayerId,
      taxType: 'VAT',
      periodKey,
      assessmentReference,
      assessmentSource: 'OFFICIAL_RRA',
      assessmentDate: new Date('2026-10-01T00:00:00.000Z'),
      originalAmount: '100.00',
      currency: 'RWF',
      status: 'PAYABLE',
      supportingEvidenceReference: 'local integration evidence reference',
      createdBy: assessorId,
      finalizedBy: assessorId,
      approvedBy: approverId,
      approvedAt: new Date(),
    });

    await assert.rejects(db.insert(taxPayment).values({
      id: randomUUID(), businessId: otherTaxpayerId, obligationId, amount: 100, method: 'bank_transfer',
    }), 'A payment cannot be linked to another taxpayer’s obligation.');

    await db.insert(taxPayment).values([
      { id: pendingPaymentId, businessId: taxpayerId, obligationId, amount: 99, method: 'mobile_money', status: 'pending', workflowStatus: 'AWAITING_CONFIRMATION' },
      { id: paymentId, businessId: taxpayerId, obligationId, amount: 95, method: 'bank_transfer', status: 'confirmed', workflowStatus: 'PAID' },
    ]);
    await db.insert(taxObligationAdjustment).values({
      id: adjustmentId, obligationId, kind: 'CREDIT', amount: '5.00', reason: 'Approved integration-test credit',
      evidenceReference: 'local credit evidence', status: 'APPROVED', createdBy: assessorId, approvedBy: approverId, approvedAt: new Date(),
    });

    await db.transaction(async (tx) => capturePaymentScoreSnapshot(
      // Drizzle's PostgreSQL.js transaction is runtime-compatible with the production Neon transaction;
      // only the driver's result HKT differs, and this integration test deliberately uses local PostgreSQL.
      tx as unknown as PaymentScoreTransaction,
      taxpayerId,
      'VAT',
      periodKey,
      'RWF',
    ));
    const [snapshot] = await db.select().from(taxPeriodPaymentScoreSnapshot)
      .where(and(eq(taxPeriodPaymentScoreSnapshot.taxpayerId, taxpayerId), eq(taxPeriodPaymentScoreSnapshot.periodKey, periodKey)))
      .orderBy(taxPeriodPaymentScoreSnapshot.calculatedAt).limit(1);
    assert.equal(snapshot.state, 'AVAILABLE');
    assert.equal(snapshot.netObligation, '95.00');
    assert.equal(snapshot.confirmedPayments, '95.00');
    assert.equal(snapshot.outstandingAmount, '0.00');
    assert.equal(snapshot.score, '100.0000');

    await assert.rejects(db.update(taxObligation).set({ originalAmount: '101.00' }).where(eq(taxObligation.id, obligationId)));
    await db.insert(taxObligationEvent).values({
      id: eventId, obligationId, eventKey, eventType: 'INTEGRATION_TEST', toStatus: 'PAYABLE', actorUserId: assessorId,
    });
    await assert.rejects(db.update(taxObligationEvent).set({ eventType: 'TAMPERED' }).where(eq(taxObligationEvent.id, eventId)));
    await assert.rejects(db.delete(taxObligationEvent).where(eq(taxObligationEvent.id, eventId)));
    await assert.rejects(db.update(taxPeriodPaymentScoreSnapshot).set({ score: '99.0000' }).where(eq(taxPeriodPaymentScoreSnapshot.id, snapshot.id)));
    await assert.rejects(db.delete(taxPeriodPaymentScoreSnapshot).where(eq(taxPeriodPaymentScoreSnapshot.id, snapshot.id)));
  } finally {
    await client.unsafe('ALTER TABLE tax_obligation_event DISABLE TRIGGER tax_obligation_event_append_only');
    await client.unsafe('ALTER TABLE tax_period_payment_score_snapshot DISABLE TRIGGER tax_period_payment_score_append_only');
    await db.delete(taxObligationEvent).where(eq(taxObligationEvent.id, eventId));
    await db.delete(taxPeriodPaymentScoreSnapshot).where(eq(taxPeriodPaymentScoreSnapshot.taxpayerId, taxpayerId));
    await db.delete(taxPayment).where(and(eq(taxPayment.businessId, taxpayerId), eq(taxPayment.obligationId, obligationId)));
    await client.unsafe('ALTER TABLE tax_obligation_adjustment DISABLE TRIGGER tax_obligation_adjustment_immutable');
    await db.delete(taxObligationAdjustment).where(eq(taxObligationAdjustment.id, adjustmentId));
    await db.delete(taxObligation).where(eq(taxObligation.id, obligationId));
    await db.delete(user).where(eq(user.id, taxpayerId));
    await db.delete(user).where(eq(user.id, otherTaxpayerId));
    await db.delete(user).where(eq(user.id, assessorId));
    await db.delete(user).where(eq(user.id, approverId));
    await client.unsafe('ALTER TABLE tax_obligation_event ENABLE TRIGGER tax_obligation_event_append_only');
    await client.unsafe('ALTER TABLE tax_period_payment_score_snapshot ENABLE TRIGGER tax_period_payment_score_append_only');
    await client.unsafe('ALTER TABLE tax_obligation_adjustment ENABLE TRIGGER tax_obligation_adjustment_immutable');
    await client.end();
  }
});
