'use server';

import { eq, desc, sql, and } from 'drizzle-orm';
import db from '@/db/drizzle';
import { auditLog, vatRecord, taxObligation, taxObligationAdjustment, taxPayment, taxPaymentEvent, taxPaymentProviderEvent, taxPaymentReceipt, user } from '@/db/schema';
import { requireTraderSession, requireRRAPermission, requireRRASession } from '@/lib/auth-guard';
import { createNotification } from '@/lib/notifications';
import { getSystemConfig } from '@/lib/actions/system-config.action';
import { simulatedPaymentAuthorizationSchema, simulatedPaymentInitiationSchema, taxPaymentReviewSchema, taxPaymentSubmissionSchema } from '@/lib/validation/tax-payment.schema';
import { getBusinessComplianceStatus } from '@/lib/compliance-status';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { assertPaymentTransition, canInitiateTaxPayment, type PaymentStatus } from '@/lib/payment-engine/domain';
import { amountToMinorUnits } from '@/lib/payment-engine/money';
import { obligationAdjustmentDelta } from '@/lib/payment-engine/period-score-service';
import { getSimulatedProvider, type SimulatedProviderName, type SimulationScenario, type SimulatorInitiationResult } from '@/lib/payment-engine/provider';
import { reconcileProviderCallback } from '@/lib/payment-engine/reconcile';

const CRITICAL_THRESHOLD = 0.8; // 80% — also notify RRA admins
const simulatedPaymentLifetimeMs = (): number => {
  const minutes = Number.parseInt(process.env.PAYMENT_SIM_MAX_DURATION_MINUTES ?? '15', 10);
  return Math.max(1, Math.min(24 * 60, Number.isFinite(minutes) ? minutes : 15)) * 60_000;
};

// ---------------------------------------------------------------------------
// Tax Compliance Status — the core compliance check
// ---------------------------------------------------------------------------

/**
 * Calculate a trader's tax compliance percentage.
 * Formula: totalPaid / netOwed * 100
 * A trader is compliant if they've paid >= 95% of their net VAT due.
 */
export async function getTaxComplianceStatus(userId?: string) {
  const session = await requireTraderSession();
  const targetId = userId ?? session.user.id;
  if (targetId !== session.user.id) {
    throw new Error('You can only view tax compliance for your own business.');
  }
  return getBusinessComplianceStatus(targetId);
}

export async function getOwnRecentTaxPayments() {
  const session = await requireTraderSession();
  return db.select({
    id: taxPayment.id, amount: taxPayment.amount, currency: taxPayment.currency,
    provider: taxPayment.provider, providerReference: taxPayment.providerReference,
    status: taxPayment.status, workflowStatus: taxPayment.workflowStatus,
    createdAt: taxPayment.createdAt, receiptNumber: taxPaymentReceipt.receiptNumber,
  }).from(taxPayment)
    .leftJoin(taxPaymentReceipt, eq(taxPaymentReceipt.paymentId, taxPayment.id))
    .where(eq(taxPayment.businessId, session.user.id))
    .orderBy(desc(taxPayment.createdAt)).limit(20);
}

// ---------------------------------------------------------------------------
// Record Tax Payment
// ---------------------------------------------------------------------------

export async function recordTaxPayment(data: {
  obligationId: string;
  method: 'mobile_money' | 'bank_transfer' | 'cash';
  reference?: string;
}, idempotencyKey: string): Promise<typeof taxPayment.$inferSelect> {
  const session = await requireTraderSession();
  const parsed = taxPaymentSubmissionSchema.safeParse({ ...data, idempotencyKey });
  if (!parsed.success) {
    throw new Error('Payment details are invalid. Please review them and try again.');
  }
  const paymentInput = parsed.data;
  const payment = await db.transaction(async (tx) => {
    // Serialize payment requests and reviewer settlement against one taxpayer row.
    const [lockedBusiness] = await tx.select({ id: user.id }).from(user)
      .where(eq(user.id, session.user.id)).for('update').limit(1);
    if (!lockedBusiness) throw new Error('Taxpayer account was not found.');

    const [existingPayment] = await tx.select().from(taxPayment)
      .where(and(eq(taxPayment.businessId, session.user.id), eq(taxPayment.idempotencyKey, paymentInput.idempotencyKey)))
      .limit(1);
    if (existingPayment) {
      if (existingPayment.obligationId !== paymentInput.obligationId || existingPayment.method !== paymentInput.method || existingPayment.reference !== (paymentInput.reference || null)) {
        throw new Error('This payment request key was already used for different payment details.');
      }
      return existingPayment;
    }

    const [obligation] = await tx.select().from(taxObligation)
      .where(and(eq(taxObligation.id, paymentInput.obligationId), eq(taxObligation.taxpayerId, session.user.id)))
      .for('update').limit(1);
    if (!obligation || obligation.status !== 'PAYABLE' || !obligation.approvedBy) {
      throw new Error('Only your finalized and authorized payable tax obligations can be paid.');
    }
    if (obligation.currency !== 'RWF') {
      throw new Error('This payment channel currently supports RWF only. Contact the tax office for another currency.');
    }

    const adjustments = await tx.select({ kind: taxObligationAdjustment.kind, amount: taxObligationAdjustment.amount })
      .from(taxObligationAdjustment)
      .where(and(eq(taxObligationAdjustment.obligationId, obligation.id), eq(taxObligationAdjustment.status, 'APPROVED')));
    const [paid] = await tx.select({ total: sql<string>`COALESCE(SUM(${taxPayment.amount}),0)::text`.as('total') })
      .from(taxPayment)
      .where(and(
        eq(taxPayment.obligationId, obligation.id),
        eq(taxPayment.status, 'confirmed'),
        eq(taxPayment.workflowStatus, 'PAID'),
      ));
    let outstandingMinor = amountToMinorUnits(obligation.originalAmount);
    for (const adjustment of adjustments) outstandingMinor += obligationAdjustmentDelta(adjustment.kind, adjustment.amount);
    outstandingMinor -= BigInt(paid?.total ?? '0') * BigInt(100);
    if (outstandingMinor <= BigInt(0) || outstandingMinor % BigInt(100) !== BigInt(0)) {
      throw new Error('The payable obligation has no whole-RWF outstanding balance. Payment was not created.');
    }
    const outstanding = Number(outstandingMinor / BigInt(100));
    if (!canInitiateTaxPayment(outstanding) || outstanding > 2_147_483_647) {
      throw new Error('The full obligation exceeds the current payment-record limit. No partial payment was created.');
    }

    const [otherPending] = await tx.select({ id: taxPayment.id }).from(taxPayment)
      .where(and(eq(taxPayment.businessId, session.user.id), eq(taxPayment.status, 'pending')))
      .limit(1);
    if (otherPending) {
      throw new Error('A payment is already awaiting settlement review. Wait for its result before submitting another request.');
    }

    const [createdPayment] = await tx
      .insert(taxPayment)
      .values({
        businessId: session.user.id,
        amount: outstanding,
        currency: obligation.currency,
        method: paymentInput.method,
        paymentReference: `TF-${crypto.randomUUID()}`,
        reference: paymentInput.reference || null,
        idempotencyKey: paymentInput.idempotencyKey,
        status: 'pending',
        workflowStatus: 'AWAITING_CONFIRMATION',
        obligationId: obligation.id,
      })
      .onConflictDoNothing({ target: [taxPayment.businessId, taxPayment.idempotencyKey] })
      .returning();

    if (!createdPayment) {
      const [retryPayment] = await tx
        .select()
        .from(taxPayment)
        .where(and(eq(taxPayment.businessId, session.user.id), eq(taxPayment.idempotencyKey, paymentInput.idempotencyKey)))
        .limit(1);
      if (!retryPayment) throw new Error('Payment retry could not be reconciled. Please contact support.');
      if (retryPayment.obligationId !== paymentInput.obligationId || retryPayment.method !== paymentInput.method || retryPayment.reference !== (paymentInput.reference || null)) {
        throw new Error('This payment request key was already used for different payment details.');
      }
      return retryPayment;
    }

    await tx.insert(auditLog).values({
      userId: session.user.id,
      action: 'TAX_PAYMENT_SUBMITTED',
      targetType: 'tax_payment',
      targetId: createdPayment.id,
      beforeState: { status: null },
      afterState: {
        status: createdPayment.status,
        amount: createdPayment.amount,
        paymentReference: createdPayment.paymentReference,
        method: createdPayment.method,
        reference: createdPayment.reference,
      },
      metadata: JSON.stringify({
        amount: outstanding,
        method: paymentInput.method,
        reference: paymentInput.reference,
        outstandingAtSubmission: outstanding,
        obligationId: obligation.id,
        assessmentReference: obligation.assessmentReference,
        amountSource: 'server_derived_approved_obligation_balance',
      }),
    });

    await tx.insert(taxPaymentEvent).values({
      paymentId: createdPayment.id,
      eventKey: `${createdPayment.id}:submitted`,
      eventType: 'PAYMENT_SUBMITTED_FOR_REVIEW',
      fromStatus: null,
      toStatus: 'AWAITING_CONFIRMATION',
      actorUserId: session.user.id,
      details: { amount: outstanding, currency: obligation.currency, obligationId: obligation.id, assessmentReference: obligation.assessmentReference, paymentReference: createdPayment.paymentReference, amountSource: 'server_derived_approved_obligation_balance' },
    });

    return createdPayment;
  });

  return payment;
}

/** Initiates a clearly labelled sandbox request. Live MTN, Airtel, and bank adapters are not configured. */
export async function initiateSimulatedTaxPayment(paymentId: string, providerName: SimulatedProviderName, scenario?: SimulationScenario): Promise<{ provider: SimulatedProviderName; providerReference: string; status: string; responseCode: string }> {
  const session = await requireTraderSession();
  const parsed = simulatedPaymentInitiationSchema.safeParse({ paymentId, provider: providerName, scenario });
  if (!parsed.success) throw new Error('Simulated payment details are invalid.');
  paymentId = parsed.data.paymentId;
  providerName = parsed.data.provider;
  scenario = parsed.data.scenario;
  if (scenario && (process.env.NODE_ENV === 'production' || process.env.PAYMENT_SIM_ALLOW_SCENARIO_SELECTION !== 'true')) {
    throw new Error('Scenario selection is restricted to explicitly enabled development and test environments.');
  }
  const provider = getSimulatedProvider(providerName);
  const result = await db.transaction(async (tx) => {
    const [payment] = await tx.select().from(taxPayment)
      .where(and(eq(taxPayment.id, paymentId), eq(taxPayment.businessId, session.user.id)))
      .for('update').limit(1);
    if (!payment || !payment.obligationId || payment.status !== 'pending' || !['AWAITING_CONFIRMATION', 'PAYMENT_INITIATED'].includes(payment.workflowStatus)) {
      throw new Error('This payment cannot be initiated.');
    }
    if (payment.providerReference) {
      if (payment.provider !== providerName) throw new Error('A different provider already owns this payment request.');
      return { provider: providerName, providerReference: payment.providerReference, status: 'pending', responseCode: 'SIM-01' };
    }
    let started: SimulatorInitiationResult;
    try {
      started = await provider.initiatePayment({ paymentReference: payment.paymentReference, amount: payment.amount, currency: 'RWF', taxpayerReference: session.user.id, obligationId: payment.obligationId, scenario });
    } catch (error) {
      const classification = error instanceof Error && error.message === 'SIMULATED_TIMEOUT'
        ? 'timeout'
        : error instanceof Error && error.message === 'SIMULATED_PROVIDER_UNAVAILABLE' ? 'provider_unavailable' : 'provider_error';
      await tx.update(taxPayment).set({
        provider: providerName, providerRequestReference: payment.paymentReference,
        lastProviderClassification: classification, nextRetryAt: null, updatedAt: new Date(),
      }).where(eq(taxPayment.id, payment.id));
      await tx.insert(taxPaymentProviderEvent).values({
        paymentId: payment.id, eventKey: `initiation-failure:${payment.id}:${crypto.randomUUID()}`, provider: providerName,
        eventType: 'PAYMENT_INITIATION_FAILURE', classification, details: { simulated: true },
      });
      return { errorMessage: 'The simulated provider did not accept the request. You can retry initiation; the obligation remains unpaid.' };
    }
    if (!started.accepted) {
      const [failed] = await tx.update(taxPayment).set({
        provider: providerName, providerReference: started.providerReference, providerRequestReference: payment.paymentReference,
        providerStatus: started.status, simulationScenario: started.scenario, confirmedAmount: null,
        initiatedAt: new Date(), nextRetryAt: null, retryCount: 0, expiresAt: new Date(Date.now() + simulatedPaymentLifetimeMs()),
        lastProviderClassification: started.responseCode, callbackProcessingState: 'PROCESSED',
        workflowStatus: 'FAILED', status: 'rejected', updatedAt: new Date(),
      }).where(eq(taxPayment.id, payment.id)).returning({ id: taxPayment.id });
      if (!failed) throw new Error('Payment changed before the provider rejection was recorded.');
      await tx.insert(taxPaymentEvent).values({
        paymentId: payment.id, eventKey: `${payment.id}:provider-rejected:${started.providerReference}`,
        eventType: 'SIMULATED_PROVIDER_REJECTED', fromStatus: payment.workflowStatus, toStatus: 'FAILED',
        actorUserId: session.user.id, details: { provider: providerName, responseCode: started.responseCode, simulated: true },
      });
      await tx.insert(taxPaymentProviderEvent).values({
        paymentId: payment.id, eventKey: `initiation-response:${started.providerReference}`, provider: providerName,
        eventType: 'PAYMENT_INITIATION_RESPONSE', classification: started.responseCode,
        details: { accepted: false, simulated: true, status: started.status },
      });
      return { provider: providerName, providerReference: started.providerReference, status: started.status, responseCode: started.responseCode };
    }
    const [updated] = await tx.update(taxPayment)
      .set({
        provider: providerName, providerReference: started.providerReference, providerRequestReference: payment.paymentReference,
        providerStatus: 'pending', simulationScenario: started.scenario, confirmedAmount: null,
        initiatedAt: new Date(), nextRetryAt: new Date(Date.now() + 60_000), retryCount: 0,
        expiresAt: new Date(Date.now() + simulatedPaymentLifetimeMs()), lastProviderClassification: started.responseCode,
        callbackProcessingState: 'NONE', workflowStatus: 'PAYMENT_INITIATED', updatedAt: new Date(),
      })
      .where(and(eq(taxPayment.id, payment.id), eq(taxPayment.businessId, session.user.id), eq(taxPayment.status, 'pending')))
      .returning({ id: taxPayment.id });
    if (!updated) throw new Error('Payment changed before initiation completed.');
    await tx.insert(taxPaymentEvent).values({
      paymentId: payment.id, eventKey: `${payment.id}:${providerName}-initiated`, eventType: 'SIMULATED_PAYMENT_INITIATED',
      fromStatus: payment.workflowStatus, toStatus: 'PAYMENT_INITIATED', actorUserId: session.user.id,
      details: { provider: providerName, providerReference: started.providerReference, simulated: true, responseCode: started.responseCode },
    });
    await tx.insert(taxPaymentProviderEvent).values({
      paymentId: payment.id, eventKey: `initiation:${providerName}:${payment.id}`, provider: providerName,
      eventType: 'PAYMENT_INITIATION_RESPONSE', classification: started.responseCode,
      details: { accepted: started.accepted, simulated: true, status: started.status },
    });
    await tx.insert(auditLog).values({
      userId: session.user.id, action: 'SIMULATED_TAX_PAYMENT_INITIATED', targetType: 'tax_payment', targetId: payment.id,
      beforeState: { workflowStatus: payment.workflowStatus }, afterState: { workflowStatus: 'PAYMENT_INITIATED' },
      metadata: JSON.stringify({ provider: providerName, simulated: true }),
    });
    return { provider: providerName, providerReference: started.providerReference, status: started.status, responseCode: started.responseCode };
  });
  if ('errorMessage' in result) throw new Error(result.errorMessage);
  return result;
}

/** Completes the explicit mock authorization step; accepts no PIN or secret from the taxpayer. */
export async function authorizeSimulatedTaxPayment(paymentId: string): Promise<{ status: string; message: string }> {
  const session = await requireTraderSession();
  const parsed = simulatedPaymentAuthorizationSchema.safeParse({ paymentId });
  if (!parsed.success) throw new Error('Simulated payment reference is invalid.');
  paymentId = parsed.data.paymentId;
  const [payment] = await db.select().from(taxPayment)
    .where(and(eq(taxPayment.id, paymentId), eq(taxPayment.businessId, session.user.id)))
    .limit(1);
  if (!payment || !payment.providerReference || !payment.obligationId ||
    !['mtn_mobile_money', 'airtel_money', 'bank_gateway'].includes(payment.provider ?? '') ||
    payment.status !== 'pending' || payment.workflowStatus !== 'PAYMENT_INITIATED') {
    throw new Error('This simulated payment is not awaiting authorization.');
  }
  const providerName = payment.provider as SimulatedProviderName;
  const provider = getSimulatedProvider(providerName);
  const context = {
    paymentReference: payment.paymentReference, providerReference: payment.providerReference,
    taxpayerReference: payment.businessId, obligationId: payment.obligationId,
    amount: payment.amount, currency: payment.currency,
  };
  const scenario = (payment.simulationScenario ?? 'pending') as SimulationScenario;
  const result = await provider.authorize(context, scenario);
  await db.insert(taxPaymentProviderEvent).values({
    paymentId: payment.id, eventKey: `authorization:${payment.id}`, provider: providerName,
    eventType: 'SIMULATED_AUTHORIZATION_RESULT', classification: result.responseCode,
    details: { status: result.status, simulated: true, pinCollected: false },
  }).onConflictDoNothing();
  const callback = await provider.makeCallback(context, result.status);
  const reconciled = await reconcileProviderCallback(providerName, callback.body, callback.signature);
  return { status: reconciled === 'settled' ? 'confirmed' : reconciled, message: result.message };
}

// ---------------------------------------------------------------------------
// RRA payment verification queue
// ---------------------------------------------------------------------------

/** List unverified submissions for authorized compliance/audit staff only. */
export async function getPendingTaxPaymentsForReview() {
  await requireRRAPermission('payments.read');

  return db
    .select({
      id: taxPayment.id,
      businessId: taxPayment.businessId,
      businessName: user.businessName,
      traderName: user.name,
      tinNumber: user.tinNumber,
      amount: taxPayment.amount,
      method: taxPayment.method,
      reference: taxPayment.reference,
      paymentReference: taxPayment.paymentReference,
      status: taxPayment.status,
      workflowStatus: taxPayment.workflowStatus,
      createdAt: taxPayment.createdAt,
    })
    .from(taxPayment)
    .innerJoin(user, eq(taxPayment.businessId, user.id))
    .where(eq(taxPayment.status, 'pending'))
    .orderBy(desc(taxPayment.createdAt))
    .limit(100);
}

/**
 * Route a payment for exception review. A typed reference is not trusted
 * settlement evidence, so this action must never mark a payment as paid.
 * Settlement requires an authenticated provider confirmation or a separate,
 * auditable evidence-review workflow that is not yet configured.
 */
export async function verifyTaxPayment(input: unknown) {
  const session = await requireRRAPermission('payments.reconcile');
  const parsed = taxPaymentReviewSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Payment review details are invalid.');
  const { paymentId, evidenceReference, evidenceType, settledAmount, reason } = parsed.data;

  const verificationResult = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(taxPayment)
      .where(eq(taxPayment.id, paymentId))
      .for('update')
      .limit(1);

    if (!existing) throw new Error('Payment submission not found.');
    if (existing.status !== 'pending' || !['AWAITING_CONFIRMATION', 'REVIEW_REQUIRED'].includes(existing.workflowStatus)) {
      throw new Error('Only pending payment submissions can be reviewed.');
    }
    if (existing.workflowStatus === 'REVIEW_REQUIRED') {
      return {
        payment: existing,
        needsReview: true as const,
        message: 'This payment is already awaiting independent settlement evidence review.',
      };
    }

    const fromStatus = existing.workflowStatus as PaymentStatus;
    if (fromStatus !== 'REVIEW_REQUIRED') assertPaymentTransition(fromStatus, 'REVIEW_REQUIRED');

    const [flagged] = await tx
      .update(taxPayment)
      .set({ workflowStatus: 'REVIEW_REQUIRED', updatedAt: new Date() })
      .where(and(eq(taxPayment.id, existing.id), eq(taxPayment.status, 'pending')))
      .returning();
    if (!flagged) throw new Error('Payment status changed before the review case could be recorded.');

    const reviewReason = 'Reference recorded for review, but no authenticated provider or independently stored evidence can confirm settlement.';
    await tx.insert(taxPaymentEvent).values({
      paymentId: existing.id,
      eventKey: `${existing.id}:exception:${crypto.randomUUID()}`,
      eventType: 'PAYMENT_EXCEPTION_RAISED',
      fromStatus,
      toStatus: 'REVIEW_REQUIRED',
      actorUserId: session.user.id,
      details: {
        evidenceType,
        evidenceReference,
        reason,
        settledAmount,
        expectedAmount: existing.amount,
        reviewReason,
        paymentReference: existing.paymentReference,
      },
    });

    await tx.insert(auditLog).values({
      userId: session.user.id,
      action: 'TAX_PAYMENT_EXCEPTION_RAISED',
      targetType: 'tax_payment',
      targetId: existing.id,
      beforeState: { status: existing.status, workflowStatus: existing.workflowStatus },
      afterState: { status: flagged.status, workflowStatus: flagged.workflowStatus },
      metadata: JSON.stringify({
        traderId: existing.businessId,
        method: existing.method,
        evidenceReference,
        evidenceType,
        reason,
        settledAmount,
        paymentReference: existing.paymentReference,
        reviewerUserId: session.user.id,
        verificationMode: 'manual_exception_review_only',
        reviewReason,
      }),
    });

    return { payment: flagged, needsReview: true as const, message: reviewReason };
  });

  return { success: false, needsReview: true, message: verificationResult.message, payment: verificationResult.payment };
}

// ---------------------------------------------------------------------------
// Get Payment History
// ---------------------------------------------------------------------------

export async function getTaxPayments() {
  const session = await requireTraderSession();

  return db
    .select()
    .from(taxPayment)
    .where(eq(taxPayment.businessId, session.user.id))
    .orderBy(desc(taxPayment.createdAt));
}

// ---------------------------------------------------------------------------
// Compliance Alert — auto-detect and notify non-compliant traders
// ---------------------------------------------------------------------------

/**
 * Check a trader's compliance and create notifications if below threshold.
 * Called after confirmTransaction, createRetailSale, and recordTaxPayment.
 *
 * - Below 95%: notify the trader
 * - Below 80%: also notify all RRA admin users
 * - Below the legacy suspension threshold (50% by default): notify RRA staff
 *   that an authorized officer should review the case. This check never changes
 *   taxpayer status or initiates an enforcement action.
 */
export async function checkAndAlertCompliance(traderId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error('Authentication is required.');
  if (traderId !== session.user.id) {
    await requireRRASession('compliance_officer', 'audit_officer');
  }
  try {
    // Calculate compliance without auth guard (called from server actions)
    const vatResult = await db
      .select({
        vatType: vatRecord.vatType,
        total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as('total'),
      })
      .from(vatRecord)
      .where(and(eq(vatRecord.businessId, traderId), eq(vatRecord.isFrozen, false)))
      .groupBy(vatRecord.vatType);

    const vatOutput = Number(vatResult.find((r) => r.vatType === 'output')?.total) || 0;
    const vatInput = Number(vatResult.find((r) => r.vatType === 'input')?.total) || 0;
    const netOwed = Math.max(0, vatOutput - vatInput);

    if (netOwed === 0) return; // No tax owed, nothing to check

    const [paymentResult] = await db
      .select({
        totalPaid: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as('total_paid'),
      })
      .from(taxPayment)
      .where(sql`${taxPayment.businessId} = ${traderId} AND ${taxPayment.status} = 'confirmed'`);

    const totalPaid = Number(paymentResult?.totalPaid) || 0;
    const compliancePct = Math.min(100, (totalPaid / netOwed) * 100);
    const outstanding = Math.max(0, netOwed - totalPaid);

    // Read dynamic thresholds
    const config = await getSystemConfig();

    // Get the trader info (needed for multiple branches below)
    const [trader] = await db
      .select({
        businessName: user.businessName,
        name: user.name,
      })
      .from(user)
      .where(eq(user.id, traderId))
      .limit(1);

    const traderName = trader?.businessName || trader?.name || 'Unknown';

    // A threshold crossing is only a signal for human review. Automated
    // compliance checks must never suspend, restrict, or otherwise decide a
    // taxpayer's status.
    if (compliancePct < config.reviewRecommendationThreshold * 100) {
      const rraUsers = await db.select({ id: user.id }).from(user).where(eq(user.role, 'rra_staff'));
      for (const rraUser of rraUsers) {
        await createNotification({
          userId: rraUser.id,
          type: 'compliance_alert',
          title: 'Potential Compliance Risk — Requires Human Review',
          message: `"${traderName}" has a TaxFlow payment indicator of ${Math.round(compliancePct)}%. Recorded outstanding amount: ${outstanding.toLocaleString()} RWF. This is not a confirmed violation or official assessment; review the authorized records before deciding any action.`,
          link: '/admin/traders',
        });
      }
    }

    // ── Below compliance threshold — notify trader ──────────────────
    if (compliancePct < config.complianceThreshold * 100) {
      await createNotification({
        userId: traderId,
        type: 'compliance_alert',
        title: 'TaxFlow Payment Indicator — Review',
        message: `Your TaxFlow payment indicator is ${Math.round(compliancePct)}%. The recorded outstanding amount is ${outstanding.toLocaleString()} RWF. Please review your records or contact support if you believe this information is incorrect.`,
        link: '/dashboard/payments',
      });
    }

    // ── Below 80% — also alert RRA admins ───────────────────────────
    if (compliancePct < CRITICAL_THRESHOLD * 100) {
      const rraUsers = await db.select({ id: user.id }).from(user).where(eq(user.role, 'rra_staff'));

      for (const rraUser of rraUsers) {
        await createNotification({
          userId: rraUser.id,
          type: 'compliance_alert',
          title: 'Potential Compliance Risk — Requires Human Review',
          message: `Trader "${traderName}" has a TaxFlow payment indicator of ${Math.round(compliancePct)}%. Recorded outstanding amount: ${outstanding.toLocaleString()} RWF. This is not a confirmed violation or official assessment.`,
          link: `/admin/traders`,
        });
      }
    }
  } catch (error) {
    // Compliance check should never break the main flow
    console.error('[Compliance] Alert check failed for trader:', traderId, error);
  }
}

// ---------------------------------------------------------------------------
// System-wide Compliance Check (Admin only)
// ---------------------------------------------------------------------------

/**
 * Iterate all traders, check compliance for each, and create alerts.
 * Returns a summary of the check.
 */
export async function runSystemComplianceCheck() {
  await requireRRASession('compliance_officer', 'audit_officer');

  const traders = await db
    .select({ id: user.id, businessName: user.businessName, name: user.name })
    .from(user)
    .where(sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`);

  let meetingConfiguredThreshold = 0;
  let belowConfiguredThreshold = 0;
  let reviewRecommended = 0;
  let alerts = 0;

  const complianceConfig = await getSystemConfig();

  for (const trader of traders) {
    try {
      // Delegate to checkAndAlertCompliance — this only creates notifications.
      await checkAndAlertCompliance(trader.id);

      // Re-read compliance to classify result for the summary
      const vatResult = await db
        .select({
          vatType: vatRecord.vatType,
          total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as('total'),
        })
        .from(vatRecord)
        .where(and(eq(vatRecord.businessId, trader.id), eq(vatRecord.isFrozen, false)))
        .groupBy(vatRecord.vatType);

      const vatOutput = Number(vatResult.find((r) => r.vatType === 'output')?.total) || 0;
      const vatInput = Number(vatResult.find((r) => r.vatType === 'input')?.total) || 0;
      const netOwed = Math.max(0, vatOutput - vatInput);

      if (netOwed === 0) {
        meetingConfiguredThreshold++;
        continue;
      }

      const [paymentResult] = await db
        .select({
          totalPaid: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as('total_paid'),
        })
        .from(taxPayment)
        .where(sql`${taxPayment.businessId} = ${trader.id} AND ${taxPayment.status} = 'confirmed'`);

      const totalPaid = Number(paymentResult?.totalPaid) || 0;
      const compliancePct = Math.min(100, (totalPaid / netOwed) * 100);

      if (compliancePct < complianceConfig.reviewRecommendationThreshold * 100) {
        reviewRecommended++;
        belowConfiguredThreshold++;
        alerts++;
      } else if (compliancePct < complianceConfig.complianceThreshold * 100) {
        belowConfiguredThreshold++;
        alerts++;
      } else {
        meetingConfiguredThreshold++;
      }
    } catch {
      // Skip individual trader errors
    }
  }

  return {
    totalChecked: traders.length,
    meetingConfiguredThreshold,
    belowConfiguredThreshold,
    reviewRecommended,
    alerts,
  };
}
