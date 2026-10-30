import { and, eq, sql } from 'drizzle-orm';
import db from '@/db/drizzle';
import { taxObligation, taxObligationAdjustment, taxPayment, taxPaymentEvent, taxPaymentProviderEvent, taxPaymentReceipt, user } from '@/db/schema';
import { assertPaymentTransition, type PaymentStatus } from './domain';
import { getSimulatedProvider, type SimulatedProviderName } from './provider';
import { capturePaymentScoreSnapshot, obligationAdjustmentDelta } from './period-score-service';
import { amountToMinorUnits } from './money';

export type CallbackReconciliationResult = 'settled' | 'pending' | 'failed' | 'review_required' | 'duplicate' | 'unknown';

/** Authenticated sandbox callback reconciliation. All financial writes commit atomically. */
export async function reconcileProviderCallback(
  providerName: SimulatedProviderName,
  rawBody: string,
  signature: string | null,
  database: typeof db = db,
): Promise<CallbackReconciliationResult> {
  const provider = getSimulatedProvider(providerName);
  const callback = await provider.verifyCallback(rawBody, signature);
  return database.transaction(async (tx) => {
    const eventKey = `${providerName}:${callback.eventId}`;
    const [payment] = await tx.select().from(taxPayment)
      .where(and(eq(taxPayment.provider, providerName), eq(taxPayment.providerReference, callback.providerReference)))
      .for('update').limit(1);
    if (!payment) return 'unknown';
    // Lock the payment before checking replay state. Concurrent deliveries with
    // the same event then observe the first committed processing result.
    const [seen] = await tx.select({ id: taxPaymentEvent.id }).from(taxPaymentEvent).where(eq(taxPaymentEvent.eventKey, eventKey)).limit(1);
    if (seen) return 'duplicate';
    await tx.insert(taxPaymentProviderEvent).values({
      paymentId: payment.id, eventKey: `callback:${eventKey}`, provider: providerName,
      eventType: 'CALLBACK_AUTHENTICATED', classification: 'signature_valid',
      details: { eventId: callback.eventId },
    });
    if (['PAID', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(payment.workflowStatus)) {
      await tx.insert(taxPaymentProviderEvent).values({
        paymentId: payment.id, eventKey: `duplicate-settlement:${eventKey}`, provider: providerName,
        eventType: 'TERMINAL_CALLBACK_IGNORED', classification: payment.workflowStatus.toLowerCase(),
        details: { eventId: callback.eventId },
      });
      return 'duplicate';
    }
    const [obligation] = await tx.select().from(taxObligation)
      .where(and(eq(taxObligation.id, payment.obligationId ?? ''), eq(taxObligation.taxpayerId, payment.businessId)))
      .for('update').limit(1);
    const [taxpayer] = await tx.select({ name: user.businessName }).from(user).where(eq(user.id, payment?.businessId ?? '')).limit(1);
    const match = obligation && payment.status === 'pending' && payment.currency === 'RWF' && callback.currency === payment.currency &&
      callback.taxpayerReference === payment.businessId && callback.obligationId === payment.obligationId &&
      Number.isSafeInteger(callback.amount) && callback.amount === payment.amount &&
      callback.paymentReference === payment.paymentReference && obligation.approvedBy && obligation.currency === payment.currency &&
      ['PAYABLE', 'PAID'].includes(obligation.status);
    if (!match) {
      if (payment.workflowStatus !== 'PAID' && payment.workflowStatus !== 'REVIEW_REQUIRED') {
        assertPaymentTransition(payment.workflowStatus as PaymentStatus, 'REVIEW_REQUIRED');
        await tx.update(taxPayment).set({ workflowStatus: 'REVIEW_REQUIRED', updatedAt: new Date() }).where(eq(taxPayment.id, payment.id));
      }
      await tx.insert(taxPaymentEvent).values({
        paymentId: payment.id, eventKey, eventType: 'PROVIDER_CALLBACK_MISMATCH', fromStatus: payment.workflowStatus,
        toStatus: payment.workflowStatus === 'PAID' ? 'PAID' : 'REVIEW_REQUIRED', actorUserId: null,
        details: { provider: providerName, eventId: callback.eventId, mismatch: true, outcome: callback.outcome },
      });
      await tx.insert(taxPaymentProviderEvent).values({ paymentId: payment.id, eventKey: `mismatch:${eventKey}`, provider: providerName, eventType: 'RECONCILIATION_MISMATCH', classification: 'review_required', details: { eventId: callback.eventId } });
      return 'review_required';
    }
    if (payment.workflowStatus === 'PAID') return 'duplicate';
    if (callback.outcome === 'pending') {
      const nextWorkflowStatus = payment.workflowStatus === 'PAYMENT_INITIATED' ? 'AWAITING_CONFIRMATION' : payment.workflowStatus;
      if (payment.workflowStatus === 'PAYMENT_INITIATED') {
        assertPaymentTransition('PAYMENT_INITIATED', 'AWAITING_CONFIRMATION');
        await tx.update(taxPayment).set({ workflowStatus: 'AWAITING_CONFIRMATION', providerStatus: 'pending', callbackProcessingState: 'PROCESSED', lastProviderClassification: 'SIM-PENDING', updatedAt: new Date() }).where(eq(taxPayment.id, payment.id));
      }
      await tx.insert(taxPaymentEvent).values({ paymentId: payment.id, eventKey, eventType: 'PROVIDER_PAYMENT_PENDING', fromStatus: payment.workflowStatus, toStatus: nextWorkflowStatus, actorUserId: null, details: { provider: providerName, eventId: callback.eventId } });
      return 'pending';
    }
    if (callback.outcome === 'failed') {
      assertPaymentTransition(payment.workflowStatus as PaymentStatus, 'FAILED');
      await tx.update(taxPayment).set({ workflowStatus: 'FAILED', status: 'rejected', providerStatus: 'failed', callbackProcessingState: 'PROCESSED', updatedAt: new Date() }).where(eq(taxPayment.id, payment.id));
      await tx.insert(taxPaymentEvent).values({ paymentId: payment.id, eventKey, eventType: 'PROVIDER_PAYMENT_FAILED', fromStatus: payment.workflowStatus, toStatus: 'FAILED', actorUserId: null, details: { provider: providerName, eventId: callback.eventId } });
      return 'failed';
    }
    if (callback.outcome === 'expired') {
      assertPaymentTransition(payment.workflowStatus as PaymentStatus, 'EXPIRED');
      await tx.update(taxPayment).set({ status: 'rejected', workflowStatus: 'EXPIRED', providerStatus: 'expired', callbackProcessingState: 'PROCESSED', updatedAt: new Date() }).where(eq(taxPayment.id, payment.id));
      await tx.insert(taxPaymentEvent).values({ paymentId: payment.id, eventKey, eventType: 'PROVIDER_PAYMENT_EXPIRED', fromStatus: payment.workflowStatus, toStatus: 'EXPIRED', actorUserId: null, details: { provider: providerName, eventId: callback.eventId } });
      return 'failed';
    }

    assertPaymentTransition(payment.workflowStatus as PaymentStatus, 'PROVIDER_CONFIRMED');
    assertPaymentTransition('PROVIDER_CONFIRMED', 'RECONCILIATION_PENDING');
    assertPaymentTransition('RECONCILIATION_PENDING', 'PAID');
    const [paidTotal] = await tx.select({ total: sql<string>`COALESCE(SUM(${taxPayment.amount}),0)::text`.as('total') })
      .from(taxPayment).where(and(eq(taxPayment.obligationId, obligation.id), eq(taxPayment.status, 'confirmed'), eq(taxPayment.workflowStatus, 'PAID')));
    const alreadyPaid = BigInt(paidTotal?.total ?? '0');
    const approvedAdjustments = await tx.select({ kind: taxObligationAdjustment.kind, amount: taxObligationAdjustment.amount })
      .from(taxObligationAdjustment)
      .where(and(eq(taxObligationAdjustment.obligationId, obligation.id), eq(taxObligationAdjustment.status, 'APPROVED')));
    let netObligation = amountToMinorUnits(obligation.originalAmount);
    for (const adjustment of approvedAdjustments) netObligation += obligationAdjustmentDelta(adjustment.kind, adjustment.amount);
    const expectedWholeRwf = netObligation / BigInt(100);
    if (netObligation <= BigInt(0) || netObligation % BigInt(100) !== BigInt(0) || alreadyPaid + BigInt(payment.amount) !== expectedWholeRwf) {
      await tx.update(taxPayment).set({ workflowStatus: 'REVIEW_REQUIRED', updatedAt: new Date() }).where(eq(taxPayment.id, payment.id));
      await tx.insert(taxPaymentEvent).values({ paymentId: payment.id, eventKey, eventType: 'PROVIDER_PAYMENT_BALANCE_MISMATCH', fromStatus: payment.workflowStatus, toStatus: 'REVIEW_REQUIRED', actorUserId: null, details: { provider: providerName, eventId: callback.eventId } });
      return 'review_required';
    }
    const [updated] = await tx.update(taxPayment).set({ status: 'confirmed', workflowStatus: 'PAID', providerStatus: 'success', confirmedAmount: callback.amount, callbackProcessingState: 'PROCESSED', updatedAt: new Date() })
      .where(and(eq(taxPayment.id, payment.id), eq(taxPayment.status, 'pending'))).returning({ id: taxPayment.id });
    if (!updated) throw new Error('Payment changed during settlement.');
    await tx.update(taxObligation).set({ status: 'PAID', updatedAt: new Date() }).where(eq(taxObligation.id, obligation.id));
    await tx.insert(taxPaymentReceipt).values({
      paymentId: payment.id, receiptNumber: `RWF-${crypto.randomUUID().toUpperCase()}`,
      taxpayerId: payment.businessId, taxpayerName: taxpayer?.name ?? 'Taxpayer', obligationId: obligation.id,
      taxType: obligation.taxType, periodKey: obligation.periodKey, assessmentReference: obligation.assessmentReference,
      amount: payment.amount, currency: payment.currency, provider: providerName, providerReference: callback.providerReference,
    });
    await tx.insert(taxPaymentEvent).values({ paymentId: payment.id, eventKey, eventType: 'PROVIDER_PAYMENT_SETTLED', fromStatus: payment.workflowStatus, toStatus: 'PAID', actorUserId: null, details: { provider: providerName, eventId: callback.eventId, receiptIssued: true } });
    await tx.insert(taxPaymentProviderEvent).values({ paymentId: payment.id, eventKey: `settled:${eventKey}`, provider: providerName, eventType: 'SETTLEMENT_COMPLETED', classification: 'settled', details: { eventId: callback.eventId } });
    await tx.insert(taxPaymentProviderEvent).values({ paymentId: payment.id, eventKey: `receipt:${eventKey}`, provider: providerName, eventType: 'RECEIPT_GENERATED', classification: 'verified', details: { eventId: callback.eventId } });
    await capturePaymentScoreSnapshot(tx, payment.businessId, obligation.taxType, obligation.periodKey, payment.currency);
    return 'settled';
  });
}
