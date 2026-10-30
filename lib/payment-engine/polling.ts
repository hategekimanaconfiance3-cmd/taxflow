import { and, eq, lte, or } from 'drizzle-orm';
import db from '@/db/drizzle';
import { taxPayment, taxPaymentEvent, taxPaymentProviderEvent } from '@/db/schema';
import { getSimulatedProvider, type SimulatedProviderName, type SimulationScenario } from './provider';
import { reconcileProviderCallback } from './reconcile';

const providerNames: readonly SimulatedProviderName[] = ['mtn_mobile_money', 'airtel_money', 'bank_gateway'];
const maxAttempts = (): number => Math.max(1, Math.min(20, Number.parseInt(process.env.PAYMENT_SIM_MAX_RETRIES ?? '8', 10) || 8));
const retryDelayMs = (attempt: number): number => Math.min(15 * 60_000, 15_000 * (2 ** Math.max(0, attempt - 1)));

export interface PollingSummary { claimed: number; settled: number; pending: number; failed: number; reviewRequired: number }

/** Durable poller entry point. Trigger from a scheduler/cron request; no process timers are used. */
export async function pollDueSimulatedPayments(limit = 25, database: typeof db = db, paymentId?: string): Promise<PollingSummary> {
  const summary: PollingSummary = { claimed: 0, settled: 0, pending: 0, failed: 0, reviewRequired: 0 };
  const now = new Date();
  const claimed = await database.transaction(async (tx) => {
    const claimedRows: (typeof taxPayment.$inferSelect)[] = [];
    const rows = await tx.select().from(taxPayment).where(and(
      eq(taxPayment.status, 'pending'),
      or(eq(taxPayment.workflowStatus, 'PAYMENT_INITIATED'), eq(taxPayment.workflowStatus, 'AWAITING_CONFIRMATION')),
      lte(taxPayment.nextRetryAt, now),
      paymentId ? eq(taxPayment.id, paymentId) : undefined,
    )).orderBy(taxPayment.nextRetryAt).limit(Math.max(1, Math.min(limit, 100))).for('update', { skipLocked: true });
    for (const row of rows) {
      const retryCount = row.retryCount + 1;
      const terminal = retryCount > maxAttempts() || Boolean(row.expiresAt && row.expiresAt <= now);
      await tx.update(taxPayment).set({
        retryCount,
        nextRetryAt: terminal ? null : new Date(now.getTime() + retryDelayMs(retryCount)),
        lastStatusCheckedAt: now,
        providerStatus: terminal ? 'expired' : row.providerStatus,
        workflowStatus: terminal ? 'EXPIRED' : row.workflowStatus,
        status: terminal ? 'rejected' : row.status,
        lastProviderClassification: terminal ? 'POLL_RETRY_EXHAUSTED_OR_EXPIRED' : 'STATUS_INQUIRY_CLAIMED',
        updatedAt: now,
      }).where(eq(taxPayment.id, row.id));
      await tx.insert(taxPaymentProviderEvent).values({
        paymentId: row.id, eventKey: `poll-claim:${row.id}:${retryCount}`, provider: row.provider ?? 'mtn_mobile_money',
        eventType: terminal ? 'POLLING_STOPPED' : 'STATUS_INQUIRY_CLAIMED',
        classification: terminal ? 'expired_or_retry_exhausted' : 'claimed', details: { retryCount },
      });
      if (!terminal) claimedRows.push({ ...row, retryCount });
      else {
        summary.failed += 1;
        await tx.insert(taxPaymentEvent).values({
          paymentId: row.id,
          eventKey: `payment-expired:${row.id}:${retryCount}`,
          eventType: 'SIMULATED_PAYMENT_POLLING_EXPIRED',
          fromStatus: row.workflowStatus,
          toStatus: 'EXPIRED',
          actorUserId: null,
          details: { retryCount, reason: 'retry_limit_or_expiration' },
        });
      }
    }
    return claimedRows;
  });
  summary.claimed = claimed.length;

  for (const payment of claimed) {
    const providerName = providerNames.find((name) => name === payment.provider);
    if (!providerName || !payment.providerReference || !payment.obligationId) {
      summary.failed += 1;
      continue;
    }
    try {
      const provider = getSimulatedProvider(providerName);
      const savedScenario = (payment.simulationScenario ?? 'pending') as SimulationScenario;
      // The delayed fixture eventually confirms, including after a process restart,
      // because the attempt count is stored on the payment row.
      const scenario: SimulationScenario = savedScenario === 'delayed' && payment.retryCount >= 2 ? 'success' : savedScenario;
      const context = {
        paymentReference: payment.paymentReference,
        providerReference: payment.providerReference,
        taxpayerReference: payment.businessId,
        obligationId: payment.obligationId,
        amount: payment.amount,
        currency: payment.currency,
      };
      const result = await provider.inquireStatus(context, scenario);
      await database.insert(taxPaymentProviderEvent).values({
        paymentId: payment.id, eventKey: `poll-result:${payment.id}:${payment.retryCount + 1}`, provider: providerName,
        eventType: 'STATUS_INQUIRY_RESULT', classification: result.responseCode,
        details: { providerStatus: result.status, simulated: true },
      });
      const callback = await provider.makeCallback(context, result.status);
      const reconciled = await reconcileProviderCallback(providerName, callback.body, callback.signature, database);
      if (reconciled === 'settled') summary.settled += 1;
      else if (reconciled === 'failed') summary.failed += 1;
      else if (reconciled === 'review_required') summary.reviewRequired += 1;
      else summary.pending += 1;
    } catch (error) {
      await database.insert(taxPaymentProviderEvent).values({
        paymentId: payment.id, eventKey: `poll-error:${payment.id}:${payment.retryCount + 1}`, provider: providerName,
        eventType: 'STATUS_INQUIRY_FAILURE', classification: error instanceof Error && error.message === 'SIMULATED_TIMEOUT' ? 'timeout' : error instanceof Error && error.message === 'SIMULATED_PROVIDER_UNAVAILABLE' ? 'provider_unavailable' : 'provider_error',
        details: { retryCount: payment.retryCount + 1 },
      });
      summary.failed += 1;
    }
  }
  return summary;
}
