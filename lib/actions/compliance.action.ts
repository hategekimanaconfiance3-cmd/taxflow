'use server';

import { eq, desc, sql, and } from 'drizzle-orm';
import db from '@/db/drizzle';
import { auditLog, vatRecord, taxPayment, taxPaymentEvent, user } from '@/db/schema';
import { requireTraderSession, requireRRAPermission, requireRRASession } from '@/lib/auth-guard';
import { createNotification } from '@/lib/notifications';
import { getSystemConfig } from '@/lib/actions/system-config.action';
import { taxPaymentReviewSchema, taxPaymentSubmissionSchema } from '@/lib/validation/tax-payment.schema';
import { getBusinessComplianceStatus } from '@/lib/compliance-status';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { assertPaymentTransition, canInitiateTaxPayment, type PaymentStatus } from '@/lib/payment-engine/domain';

const CRITICAL_THRESHOLD = 0.8; // 80% — also notify RRA admins

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

// ---------------------------------------------------------------------------
// Record Tax Payment
// ---------------------------------------------------------------------------

export type RecordTaxPaymentResult =
  | { success: true; payment: typeof taxPayment.$inferSelect }
  | { success: false; error: string; reference?: string };

export async function recordTaxPayment(rawData: unknown, idempotencyKey: unknown): Promise<RecordTaxPaymentResult> {
  const session = await requireTraderSession();
  const parsed = taxPaymentSubmissionSchema.safeParse({
    ...(typeof rawData === 'object' && rawData !== null && !Array.isArray(rawData) ? rawData : {}),
    idempotencyKey,
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Payment details are invalid. Please review them and try again.' };
  }
  const paymentInput = parsed.data;
  const correlationId = crypto.randomUUID();
  let payment: typeof taxPayment.$inferSelect;
  try {
  payment = await db.transaction(async (tx) => {
    // Serialize payment requests and reviewer settlement against one taxpayer row.
    const [lockedBusiness] = await tx.select({ id: user.id }).from(user)
      .where(eq(user.id, session.user.id)).for('update').limit(1);
    if (!lockedBusiness) throw new Error('Taxpayer account was not found.');

    const [existingPayment] = await tx.select().from(taxPayment)
      .where(and(eq(taxPayment.businessId, session.user.id), eq(taxPayment.idempotencyKey, paymentInput.idempotencyKey)))
      .limit(1);
    if (existingPayment) {
      if (existingPayment.method !== paymentInput.method || existingPayment.reference !== (paymentInput.reference || null)) {
        throw new Error('This payment request key was already used for different payment details.');
      }
      return existingPayment;
    }

    // This is a recorded VAT balance, not an official RRA assessment. Never
    // accept an amount from the browser or let the eligibility score block it.
    const vatResult = await tx.select({
      vatType: vatRecord.vatType,
      total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as('total'),
    }).from(vatRecord)
      .where(and(eq(vatRecord.businessId, session.user.id), eq(vatRecord.isFrozen, false)))
      .groupBy(vatRecord.vatType);
    const vatOutput = Number(vatResult.find((row) => row.vatType === 'output')?.total) || 0;
    const vatInput = Number(vatResult.find((row) => row.vatType === 'input')?.total) || 0;
    const [paymentResult] = await tx.select({
      totalPaid: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as('total_paid'),
    }).from(taxPayment)
      .where(and(eq(taxPayment.businessId, session.user.id), eq(taxPayment.status, 'confirmed')));
    const outstanding = Math.max(0, vatOutput - vatInput - (Number(paymentResult?.totalPaid) || 0));
    if (!canInitiateTaxPayment(outstanding)) {
      throw new Error('No recorded VAT balance is currently outstanding. Payment request was not created.');
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
        method: paymentInput.method,
        paymentReference: `TF-${crypto.randomUUID()}`,
        reference: paymentInput.reference || null,
        idempotencyKey: paymentInput.idempotencyKey,
        status: 'pending',
        workflowStatus: 'AWAITING_CONFIRMATION',
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
      if (retryPayment.method !== paymentInput.method || retryPayment.reference !== (paymentInput.reference || null)) {
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
        amountSource: 'server_derived_recorded_vat_balance',
      }),
    });

    await tx.insert(taxPaymentEvent).values({
      paymentId: createdPayment.id,
      eventKey: `${createdPayment.id}:submitted`,
      eventType: 'PAYMENT_SUBMITTED_FOR_REVIEW',
      fromStatus: null,
      toStatus: 'AWAITING_CONFIRMATION',
      actorUserId: session.user.id,
      details: { amount: outstanding, currency: 'RWF', paymentReference: createdPayment.paymentReference, amountSource: 'server_derived_recorded_vat_balance' },
    });

    return createdPayment;
  });
  } catch (error) {
    const knownMessages = new Set([
      'Taxpayer account was not found.',
      'This payment request key was already used for different payment details.',
      'No recorded VAT balance is currently outstanding. Payment request was not created.',
      'A payment is already awaiting settlement review. Wait for its result before submitting another request.',
      'Payment retry could not be reconciled. Please contact support.',
    ]);
    if (error instanceof Error && knownMessages.has(error.message)) {
      return { success: false, error: error.message };
    }
    console.error('Tax payment submission failed', {
      userId: session.user.id,
      correlationId,
      errorName: error instanceof Error ? error.name : typeof error,
      databaseCode: error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined,
    });
    return {
      success: false,
      error: 'The payment request could not be recorded. No payment was confirmed. Contact support with the reference below.',
      reference: correlationId,
    };
  }

  return { success: true, payment };
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
 * Confirm a payment only after an authorized officer independently checks the
 * bank/provider/cash evidence. The evidence reference and reviewer are audited.
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

    const [lockedTrader] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, existing.businessId))
      .for('update')
      .limit(1);
    if (!lockedTrader) throw new Error('Taxpayer account was not found.');

    let exceptionReason: string | null = null;
    // The request amount is the server-calculated full balance snapshot from
    // submission time. VAT records can change while a payment is pending, so
    // comparing against today's balance incorrectly rejects valid settlement
    // evidence for an already-created request. The verified amount must still
    // exactly match that immutable request amount (no partial payment).
    if (settledAmount !== existing.amount) {
      exceptionReason = 'Settlement amount does not match the full payment request amount.';
    } else if ((existing.method === 'cash' && evidenceType !== 'official_cash_receipt')
      || (existing.method === 'bank_transfer' && evidenceType !== 'bank_settlement')
      || (existing.method === 'mobile_money' && evidenceType !== 'provider_settlement')) {
      exceptionReason = 'Evidence type does not match the submitted payment method.';
    }

    // If the trader submitted a provider reference, it must match the reviewed evidence.
    if (!exceptionReason && existing.reference && existing.reference.trim() !== evidenceReference) {
      exceptionReason = 'The evidence reference does not match the reference submitted with this payment.';
    }

    const fromStatus = existing.workflowStatus as PaymentStatus;
    if (exceptionReason) {
      if (fromStatus !== 'REVIEW_REQUIRED') assertPaymentTransition(fromStatus, 'REVIEW_REQUIRED');
      const [flagged] = await tx
        .update(taxPayment)
        .set({ workflowStatus: 'REVIEW_REQUIRED', updatedAt: new Date() })
        .where(and(eq(taxPayment.id, existing.id), eq(taxPayment.status, 'pending')))
        .returning();
      if (!flagged) throw new Error('Payment status changed before the exception could be recorded.');

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
          mismatch: exceptionReason,
          paymentReference: existing.paymentReference,
        },
      });
      await tx.insert(auditLog).values({
        userId: session.user.id,
        action: 'TAX_PAYMENT_EXCEPTION_RAISED',
        targetType: 'tax_payment',
        targetId: existing.id,
        beforeState: { workflowStatus: existing.workflowStatus, status: existing.status },
        afterState: { workflowStatus: flagged.workflowStatus, status: flagged.status },
        metadata: JSON.stringify({ reason: exceptionReason, reviewReason: reason, evidenceType, evidenceReference, settledAmount, paymentReference: existing.paymentReference }),
      });
      return { payment: flagged, needsReview: true as const, message: exceptionReason };
    }

    if (fromStatus !== 'REVIEW_REQUIRED') assertPaymentTransition(fromStatus, 'REVIEW_REQUIRED');
    assertPaymentTransition('REVIEW_REQUIRED', 'RECONCILIATION_PENDING');
    assertPaymentTransition('RECONCILIATION_PENDING', 'PAID');

    const [updated] = await tx
      .update(taxPayment)
      .set({
        status: 'confirmed',
        workflowStatus: 'PAID',
        reference: existing.reference ?? evidenceReference,
        updatedAt: new Date(),
      })
      .where(and(eq(taxPayment.id, existing.id), eq(taxPayment.status, 'pending')))
      .returning();

    if (!updated) throw new Error('Payment status changed before verification completed.');

    await tx.insert(taxPaymentEvent).values([
      {
        paymentId: existing.id,
        eventKey: `${existing.id}:manual-review:${crypto.randomUUID()}`,
        eventType: 'MANUAL_EVIDENCE_REVIEWED',
        fromStatus,
        toStatus: 'REVIEW_REQUIRED',
        actorUserId: session.user.id,
        details: { evidenceType, evidenceReference, reason, paymentReference: existing.paymentReference },
      },
      {
        paymentId: existing.id,
        eventKey: `${existing.id}:reconciliation:${crypto.randomUUID()}`,
        eventType: 'SETTLEMENT_RECONCILED',
        fromStatus: 'REVIEW_REQUIRED',
        toStatus: 'RECONCILIATION_PENDING',
        actorUserId: session.user.id,
        details: { evidenceType, evidenceReference, settledAmount, currency: 'RWF', paymentReference: existing.paymentReference },
      },
      {
        paymentId: existing.id,
        eventKey: `${existing.id}:paid:${crypto.randomUUID()}`,
        eventType: 'TAX_PAYMENT_RECONCILED',
        fromStatus: 'RECONCILIATION_PENDING',
        toStatus: 'PAID',
        actorUserId: session.user.id,
        details: { evidenceType, evidenceReference, reason, settledAmount, currency: 'RWF', paymentReference: existing.paymentReference },
      },
    ]);

    await tx.insert(auditLog).values({
      userId: session.user.id,
      action: 'TAX_PAYMENT_VERIFIED',
      targetType: 'tax_payment',
      targetId: existing.id,
      beforeState: {
        status: existing.status,
        amount: existing.amount,
        reference: existing.reference,
      },
      afterState: {
        status: updated.status,
        amount: updated.amount,
        reference: updated.reference,
      },
      metadata: JSON.stringify({
        traderId: existing.businessId,
        method: existing.method,
        evidenceReference,
        evidenceType,
        reason,
        settledAmount,
        paymentReference: existing.paymentReference,
        reviewerUserId: session.user.id,
        verificationMode: 'manual_authorized_review',
      }),
    });

    return { payment: updated, needsReview: false as const, message: null };
  });

  return verificationResult.needsReview
    ? { success: false, needsReview: true, message: verificationResult.message, payment: verificationResult.payment }
    : { success: true, payment: verificationResult.payment };
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
